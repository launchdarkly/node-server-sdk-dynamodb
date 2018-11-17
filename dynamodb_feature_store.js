var AWS = require('aws-sdk');
var dataKind = require('ldclient-node/versioned_data_kind');
var winston = require('winston');

var helpers = require('./dynamodb_helpers');
var CachingStoreWrapper = require('ldclient-node/caching_store_wrapper');

var defaultCacheTTLSeconds = 15;

function DynamoDBFeatureStore(tableName, options) {
  var ttl = options && options.cacheTTL;
  if (ttl === null || ttl === undefined) {
    ttl = defaultCacheTTLSeconds;
  }
  return new CachingStoreWrapper(dynamoDBFeatureStoreInternal(tableName, options), ttl);
}

function dynamoDBFeatureStoreInternal(tableName, options) {
  options = options || {};
  var logger = (options.logger ||
    new winston.Logger({
      level: 'info',
      transports: [
        new (winston.transports.Console)(),
      ]
    })
  );
  var dynamoDBClient = options.dynamoDBClient || new AWS.DynamoDB.DocumentClient(options.clientOptions);
  var prefix = options.prefix || '';

  var store = {};

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
    helpers.queryHelper(dynamoDBClient, params).then(function (items) {
      var results = {};
      for (var i = 0; i < items.length; i++) {
        var item = unmarshalItem(items[i]);
        if (item) {
          results[item.key] = item;
        }
      }
      cb(results);
    }, function (err) {
      logger.error('failed to get all ' + kind.namespace +  ': ' + err);
      cb(null);
    });
  };

  store.initInternal = function(allData, cb) {
    readExistingItems(allData)
      .then(function(existingItems) {
        var existingNamespaceKeys = {};
        for (var i = 0; i < existingItems.length; i++) {
          existingNamespaceKeys[makeNamespaceKey(existingItems[i])] = existingItems[i].version;
        }
        
        // Always write the initialized token when we initialize.
        var ops = [{PutRequest: { TableName: tableName, Item: initializedToken() }}];
        delete existingNamespaceKeys[makeNamespaceKey(initializedToken())];

        // Write all initial data (with version checks).
        for (var kindNamespace in allData) {
          for (var key in allData[kindNamespace]) {
            delete existingNamespaceKeys[kindNamespace + '$' + key];
            ops.push({ PutRequest: makePutRequest(dataKind[kindNamespace], allData[kindNamespace][key]) });
          }
        }

        // Remove existing data that is not in the new list.
        for (var namespaceKey in existingNamespaceKeys) {
          var version = existingNamespaceKeys[namespaceKey];
          var namespaceAndKey = namespaceKey.split('$');
          ops.push({ DeleteRequest: {
            TableName: tableName,
            Key: {
              namespace: namespaceAndKey[0],
              key: namespaceAndKey[1]
            },
            ConditionExpression: 'attribute_not_exists(version) OR version < :new_version',
            ExpressionAttributeValues: {':new_version': version }
          }});
        }

        var writePromises = helpers.batchWrite(dynamoDBClient, tableName, ops);
    
        return Promise.all(writePromises).then(function() { cb && cb(); });
      },
      function (err) {
        logger.error('failed to initialize: ' + err);
      });
  };

  store.upsertInternal = function(kind, item, cb) {
    var params = makePutRequest(kind, item);

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
    // The node DynamoDB client is stateless, so close isn't a meaningful operation.
  };

  function queryParamsForNamespace(namespace) {
    return {
      TableName: tableName,
      KeyConditionExpression: 'namespace = :namespace',
      FilterExpression: 'attribute_not_exists(deleted) OR deleted = :deleted',
      ExpressionAttributeValues: { ':namespace': namespace, ':deleted': false }
    };
  }

  function readExistingItems(newData) {
    var p = Promise.resolve([]);
    Object.keys(newData).forEach(function(namespace) {
      p = p.then(function(previousItems) {
        var params = queryParamsForNamespace(namespace);
        return helpers.queryHelper(dynamoDBClient, params).then(function (items) {
          return previousItems.concat(items);
        });
      });
    });
    return p;
  }

  function prefixedNamespace(baseNamespace) {
    return prefix ? (prefix + ':' + baseNamespace) : baseNamespace;
  }

  function namespaceForKind(kind) {
    return prefixedNamespace(kind.namespace);
  }

  function initializedToken() {
    var value = prefixedNamespace('$inited');
    return { namespace: value, key: value };
  }

  function marshalItem(kind, item) {
    return {
      namespace: kind.namespace,
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

  function makePutRequest(kind, item) {
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

  return store;
}

module.exports = DynamoDBFeatureStore;
