var DynamoDBFeatureStore = require('../dynamodb_feature_store');
var testBase = require('ldclient-node/test/feature_store_test_base');
var AWS = require('aws-sdk');

describe('DynamoDBFeatureStore', function() {

  AWS.config.update({
    region: 'us-west-2',
    endpoint: 'http://localhost:8000'
  });

  var dynamodb = new AWS.DynamoDB();

  var table='test-store';

  beforeAll(function(done) {
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

    dynamodb.deleteTable({ TableName: table }, function(err) {
      if (err) {
        jasmine.error('Unable to delete table. Error JSON:', JSON.stringify(err, null, 2));
      }

      dynamodb.createTable(params, function(err) {
        if (err) {
          jasmine.error('Unable to create table. Error JSON:', JSON.stringify(err, null, 2));
        }
        waitForTable(done);
      });
    });
  });

  function waitForTable(done) {
    dynamodb.describeTable({ TableName: table }, function(err) {
      if (err) {
        if (err.code == 'ResourceNotFoundException') {
          setTimeout(function () { waitForTable(done); }, 100);
        } else {
          jasmine.error('Unable to create table: ', JSON.stringify(err, null, 2));
        }
      } else {
        done();
      }
    });
  }

  function clearTable(done) {
    var client = new AWS.DynamoDB.DocumentClient();
    var store = makeStore();
    var ops = [];
    store.underlyingStore.paginationHelper({TableName: table}, function (params, cb) { client.scan(params, cb); })
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
        Promise.all(store.underlyingStore.batchWrite(ops))
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

  testBase.baseFeatureStoreTests(makeStore, clearTable, false);
  testBase.baseFeatureStoreTests(makeStoreWithoutCache, clearTable, false);
  testBase.concurrentModificationTests(makeStoreWithoutCache, makeStoreWithHook);
});
