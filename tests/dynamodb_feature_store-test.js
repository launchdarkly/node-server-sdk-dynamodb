var DynamoDBFeatureStore = require('../dynamodb_feature_store');
var helpers = require('../dynamodb_helpers');
var testBase = require('ldclient-node/test/feature_store_test_base');
var AWS = require('aws-sdk');

describe('DynamoDBFeatureStore', function() {

  AWS.config.update({
    credentials: { accessKeyId: 'fake', secretAccessKey: 'fake' },
    region: 'us-west-2',
    endpoint: 'http://localhost:8000'
  });

  var dynamodb = new AWS.DynamoDB();

  var table='test-store';

  beforeAll(function(done) {
    dynamodb.describeTable({ TableName: table }, function(err) {
      if (!err) {
        done();
        return;
      }

      var params = {
        TableName: table,
        KeySchema: [ 
          { AttributeName: 'namespace', KeyType: 'HASH'},  //Partition key
          { AttributeName: 'key', KeyType: 'RANGE' }  //Sort key
        ],
        AttributeDefinitions: [       
          { AttributeName: 'namespace', AttributeType: 'S' },
          { AttributeName: 'key', AttributeType: 'S' }
        ],
        ProvisionedThroughput: {       
          ReadCapacityUnits: 10, 
          WriteCapacityUnits: 10
        }
      };

      dynamodb.createTable(params, function(err) {
        if (err) {
          done.fail('Unable to create table. Error JSON: ' + JSON.stringify(err, null, 2));
        }
        waitForTable(done);
      });
    });
  });

  function waitForTable(done) {
    dynamodb.describeTable({ TableName: table }, function(err, tableInfo) {
      if (err) {
        if (err.code == 'ResourceNotFoundException' || (tableInfo && tableInfo.Table.TableStatus == 'TableStatusActive')) {
          setTimeout(function () { waitForTable(done); }, 100);
        } else {
          done.fail('Unable to create table: ' + JSON.stringify(err, null, 2));
        }
      } else {
        done();
      }
    });
  }

  function clearTable(done) {
    var client = new AWS.DynamoDB.DocumentClient();
    var ops = [];
    helpers.paginationHelper({TableName: table}, function (params, cb) { client.scan(params, cb); })
      .then(function (items) {
        for (var i = 0; i < items.length; i++) {
          ops.push({
            DeleteRequest: {
              TableName: table,
              Key: {
                namespace: items[i].namespace,
                key: items[i].key
              }
            }
          });
        }
        Promise.all(helpers.batchWrite(client, table, ops))
          .then(function() { done(); });
      });
  }

  function makeStore() {
    return new DynamoDBFeatureStore(table);
  }

  function makeStoreWithoutCache() {
    return new DynamoDBFeatureStore(table, {cacheTTL: 0});
  }

  function makeStoreWithHook(hook) {
    var store = makeStore();
    store.underlyingStore.testUpdateHook = hook;
    return store;
  }

  describe('cached', function() {
    testBase.baseFeatureStoreTests(makeStore, clearTable, true);
  });

  describe('uncached', function() {
    testBase.baseFeatureStoreTests(makeStoreWithoutCache, clearTable, false);
  });

  testBase.concurrentModificationTests(makeStore, makeStoreWithHook);
});
