var AWS = require('aws-sdk');
var dataKind = require('ldclient-node/versioned_data_kind');
var winston = require('winston');

var CachingStoreWrapper = require('ldclient-node/caching_store_wrapper');

var initializedToken = { namespace: '$inited', key: '$inited' };

function DynamoDBFeatureStore(tableName, options) {
  return new CachingStoreWrapper(new dynamoDBFeatureStoreInternal(tableName, options));
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

  this.getInternal = function(kind, key, cb) {
    dynamoDBClient.get({
      TableName: tableName,
      Key: {
        namespace: kind.namespace,
        key: key,
      }
    }, function(err, data) {
      if (err || !data.Item) {
        if (err) {
          logger.error('failed to get:' + err);
        }
        cb(null);
      } else {
        // strip namespace as it's just used for partitioning in the table
        delete data.Item['namespace'];
        cb(data.Item);
      }
    });
  };

  this.getAllInternal = function(kind, cb) {
    var params = {
      TableName: tableName,
      KeyConditionExpression: 'namespace = :namespace',
      FilterExpression: 'attribute_not_exists(deleted) OR deleted = :deleted',
      ExpressionAttributeValues: { ':namespace': kind.namespace, ':deleted': false }
    };
    this.paginationHelper(params, function(params, cb) { return dynamoDBClient.query(params, cb); }).then(function (items) {
      var results = {};
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        // Remove the 'namespace' key from the item as it was only added to be
        // used as a partition key and is not part of the item itself.
        delete item['namespace'];
        results[item.key] = item;
      }
      cb(results);
    }, function (err) {
      logger.error('failed to get all ' + kind.namespace +  ': ' + err);
      cb(null);
    });
  };

  this.initInternal = function(allData, cb) {
    var this_ = this;
    this.paginationHelper({ TableName: tableName }, function(params, cb) { return dynamoDBClient.scan(params, cb); })
      .then(function(existingItems) {
        var existingNamespaceKeys = [];
        for (var i = 0; i < existingItems.length; i++) {
          existingNamespaceKeys[makeNamespaceKey(existingItems[i])] = existingItems[i].version;
        }
        
        // Always write the initialized token when we initialize.
        var ops = [{PutRequest: { TableName: tableName, Item: initializedToken }}];
        delete existingNamespaceKeys[makeNamespaceKey(initializedToken)];

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

        var writePromises = this_.batchWrite(ops);
    
        Promise.all(writePromises).then(function() { cb && cb(); });
      },
      function (err) {
        logger.error('failed to retrieve initial state: ' + err);
      });
  };

  this.upsertInternal = function(kind, item, cb) {
    var params = makePutRequest(kind, item);

    // testUpdateHook is instrumentation, used only by the unit tests
    var prepare = this.testUpdateHook || function(prepareCb) { prepareCb(); };

    var this_ = this;
    prepare(function () {
      dynamoDBClient.put(params, function(err) {
        if (err) {
          if (err.code !== 'ConditionalCheckFailedException') {
            logger.error('failed to upsert: ' + err);
            cb(err, null);
            return;
          }
          this_.getInternal(kind, item.key, function (existingItem) {
            cb(null, existingItem);
          });
          return;
        }
        cb(null, item);
      });
    });
  };

  this.initializedInternal = function(cb) {
    dynamoDBClient.get({
      TableName: tableName,
      Key: initializedToken,
    }, function(err, data) {
      if (err) {
        logger.error(err);
        cb(false);
        return;
      }
      var inited = data.Item && data.Item.key === initializedToken.key;
      cb(!!inited);
    });
  };

  this.close = function() {
    // The node DynamoDB client is stateless, so close isn't a meaningful operation.
  };

  this.batchWrite = function(ops) {
    var writePromises = [];
    // BatchWrite can only accept 25 items at a time, so split up the writes into batches of 25.
    for (var i = 0; i < ops.length; i += 25) {
      var requestItems = {};
      requestItems[tableName]= ops.slice(i, i+25);
      writePromises.push(new Promise(function (resolve, reject) {
        dynamoDBClient.batchWrite({
          RequestItems: requestItems
        }, function(err) {
          if (err) {
            logger.error('failed to init: ' + err);
            reject();
          }
          resolve();
        });
      }));
    }
    return writePromises;
  };

  this.paginationHelper = function(params, executeFn, startKey) {
    var this_ = this;
    return new Promise(function(resolve, reject) {
      if (startKey) {
        params['ExclusiveStartKey'] = startKey;
      }
      executeFn(params, function(err, data) {
        if (err) {
          reject(err);
          return;
        }

        if ('LastEvaluatedKey' in data) {
          this_.paginationHelper(params, executeFn, data['LastEvaluatedKey']).then(function (nextPageItems) {
            resolve(data.Items.concat(nextPageItems));
          });
        } else {
          resolve(data.Items);
        }
      });
    });
  };

  function makePutRequest(kind, item) {
    var storeItem = Object.assign({}, item);
    storeItem.namespace = kind.namespace;
    return {
      TableName: tableName,
      Item: storeItem,
      ConditionExpression: 'attribute_not_exists(version) OR version < :new_version',
      ExpressionAttributeValues: {':new_version': storeItem.version }
    };
  }

  function makeNamespaceKey(item) {
    return item.namespace + '$' + item.key;
  }

  return this;
}

module.exports = DynamoDBFeatureStore;

