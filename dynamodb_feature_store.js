const { initState, batchWrite, queryHelper } = require('./dynamodb_helpers');
const CachingStoreWrapper = require('launchdarkly-node-server-sdk/caching_store_wrapper');

const defaultCacheTTLSeconds = 15;

// We won't try to store items whose total size exceeds this. The DynamoDB documentation says
// only "400KB", which probably means 400*1024, but to avoid any chance of trying to store a
// too-large item we are rounding it down.
const dynamoDbMaxItemSize = 400000;

// Note that the format of parameters in this implementation is a bit different than in the
// LD DynamoDB integrations for some other platforms, because we are using the
// AWS.DynamoDB.DocumentClient class, which represents values as simple types like
// string or number, rather than in the { S: stringValue } or { N: numericStringValue }
// format used by the basic AWS DynamoDB API.

function DynamoDBFeatureStore(tableName, maybeOptions) {
  const options = maybeOptions || {};
  const ttl = options.cacheTTL !== null && options.cacheTTL !== undefined
    ? options.cacheTTL
    : defaultCacheTTLSeconds;
  return config =>
    new CachingStoreWrapper(
      dynamoDBFeatureStoreInternal(tableName, options, config.logger),
      ttl,
      'DynamoDB'
    );
}

function dynamoDBFeatureStoreInternal(tableName, options, logger) {
  const state = initState(options);
  const dynamoDBClient = state.client;
  const prefix = state.prefix;

  const store = {};

  store.getInternal = function(kind, key, cb) {
    dynamoDBClient.get({
      TableName: tableName,
      Key: {
        namespace: namespaceForKind(kind),
        key: key,
      }
    }, function(err, data) {
      if (err || !data.Item) {
        if (err) {
          logger.error('failed to get:' + err);
        }
        cb(null);
      } else {
        cb(unmarshalItem(data.Item));
      }
    });
  };

  store.getAllInternal = function(kind, cb) {
    var params = queryParamsForNamespace(kind.namespace);
    queryHelper(dynamoDBClient, params).then(function (items) {
      var results = {};
      for (var i = 0; i < items.length; i++) {
        var item = unmarshalItem(items[i]);
        if (item) {
          results[item.key] = item;
        }
      }
      cb(results);
    }).catch(function (err) {
      logger.error('failed to get all ' + kind.namespace +  ': ' + err);
      cb(null);
    });
  };

  store.initOrderedInternal = function(allData, cb) {
    readExistingItems(allData)
      .then(function(existingItems) {
        var existingNamespaceKeys = {};
        for (var i = 0; i < existingItems.length; i++) {
          existingNamespaceKeys[makeNamespaceKey(existingItems[i])] = true;
        }
        delete existingNamespaceKeys[makeNamespaceKey(initializedToken())];
        
        // Write all initial data (without version checks).
        var ops = [];
        allData.forEach(function(collection) {
          collection.items.forEach(function(item) {
            var key = item.key;
            const dbItem = marshalItem(collection.kind, item);
            if (checkSizeLimit(dbItem)) {
              delete existingNamespaceKeys[namespaceForKind(collection.kind) + '$' + key];
              ops.push({ PutRequest: { Item: dbItem } });
            }
          });
        });

        // Remove existing data that is not in the new list.
        for (var namespaceKey in existingNamespaceKeys) {
          var namespaceAndKey = namespaceKey.split('$');
          ops.push({ DeleteRequest: { Key: { namespace: namespaceAndKey[0], key: namespaceAndKey[1] } } });
        }

        // Always write the initialized token when we initialize.
        ops.push({ PutRequest: { Item: initializedToken() } });

        var writePromises = batchWrite(dynamoDBClient, tableName, ops);
    
        return Promise.all(writePromises);
      })
      .catch(function (err) {
        logger.error('failed to initialize: ' + err);
      })
      .then(function() { cb && cb(); });
  };

  store.upsertInternal = function(kind, item, cb) {
    var params = makeVersionedPutRequest(kind, item);
    if (!checkSizeLimit(params.Item)) {
      // We deliberately don't report this back to the SDK as an error, because we don't want to trigger any
      // useless retry behavior. We just won't do the update.
      cb(null, null);
      return;
    }

    // testUpdateHook is instrumentation, used only by the unit tests
    var prepare = store.testUpdateHook || function(prepareCb) { prepareCb(); };

    prepare(function () {
      dynamoDBClient.put(params, function(err) {
        if (err) {
          if (err.code !== 'ConditionalCheckFailedException') {
            logger.error('failed to upsert: ' + err);
            cb(err, null);
            return;
          }
          store.getInternal(kind, item.key, function (existingItem) {
            cb(null, existingItem);
          });
          return;
        }
        cb(null, item);
      });
    });
  };

  store.initializedInternal = function(cb) {
    var token = initializedToken();
    dynamoDBClient.get({
      TableName: tableName,
      Key: token,
    }, function(err, data) {
      if (err) {
        logger.error(err);
        cb(false);
        return;
      }
      var inited = data.Item && data.Item.key === token.key;
      cb(!!inited);
    });
  };

  store.close = function() {
    // The Node DynamoDB client is stateless, so close isn't a meaningful operation.
  };

  function queryParamsForNamespace(namespace) {
    return {
      TableName: tableName,
      KeyConditionExpression: 'namespace = :namespace',
      FilterExpression: 'attribute_not_exists(deleted) OR deleted = :deleted',
      ExpressionAttributeValues: { ':namespace': prefix + namespace, ':deleted': false }
    };
  }

  function readExistingItems(allData) {
    var p = Promise.resolve([]);
    allData.forEach(function(collection) {
      var namespace = collection.kind.namespace;
      p = p.then(function(previousItems) {
        var params = queryParamsForNamespace(namespace);
        return queryHelper(dynamoDBClient, params).then(function (items) {
          return previousItems.concat(items);
        });
      });
    });
    return p;
  }

  function namespaceForKind(kind) {
    return prefix + kind.namespace;
  }

  function initializedToken() {
    var value = prefix + '$inited';
    return { namespace: value, key: value };
  }

  function marshalItem(kind, item) {
    return {
      namespace: namespaceForKind(kind),
      key: item.key,
      version: item.version,
      item: JSON.stringify(item)
    };
  }

  function unmarshalItem(dbItem) {
    var itemJson = dbItem.item;
    if (itemJson) {
      try {
        return JSON.parse(itemJson);
      } catch(e) {
        logger.error('database item did not contain a valid JSON object');
      }
    }
    return null;
  }

  function makeVersionedPutRequest(kind, item) {
    return {
      TableName: tableName,
      Item: marshalItem(kind, item),
      ConditionExpression: 'attribute_not_exists(version) OR version < :new_version',
      ExpressionAttributeValues: {':new_version': item.version }
    };
  }

  function makeNamespaceKey(item) {
    return item.namespace + '$' + item.key;
  }

  function checkSizeLimit(item) {
    let size = 0;
    for (const [key, value] of Object.entries(item)) {
      size += key.length + value.toString().length;
    }
    if (size <= dynamoDbMaxItemSize) {
      return true;
    }
    logSizeLimitError(item.namespace, item.key);
    return false;
  }

  function logSizeLimitError(namespace, key) {
    logger.error(`The item "${key}" in "${namespace}" was too large to store in DynamoDB and was dropped`);
  }
  
  return store;
}

module.exports = DynamoDBFeatureStore;
