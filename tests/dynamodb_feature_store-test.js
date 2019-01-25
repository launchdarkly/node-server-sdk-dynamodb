var DynamoDBFeatureStore = require('../dynamodb_feature_store');
var helpers = require('../dynamodb_helpers');
var testBase = require('ldclient-node/test/feature_store_test_base');
var dataKind = require('ldclient-node/versioned_data_kind');
var AWS = require('aws-sdk');

function stubLogger() {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };
}

describe('DynamoDBFeatureStore', function() {

  AWS.config.update({
    credentials: { accessKeyId: 'fake', secretAccessKey: 'fake' },
    region: 'us-west-2',
    endpoint: 'http://localhost:8000'
  });

  var dynamodb = new AWS.DynamoDB();

  var table = 'test-store';

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

  function makeStoreWithPrefix(prefix) {
    return new DynamoDBFeatureStore(table, {prefix: prefix, cacheTTL: 0});
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
    testBase.baseFeatureStoreTests(makeStoreWithoutCache, clearTable, false, makeStoreWithPrefix);
  });

  testBase.concurrentModificationTests(makeStore, makeStoreWithHook);

  describe('handling errors from DynamoDB client', function() {
    var err = new Error('error');
    var client;
    var logger;
    var store;

    beforeEach(() => {
      client = {};
      logger = stubLogger();
      store = new DynamoDBFeatureStore(table, { dynamoDBClient: client, logger: logger });
    });

    it('error from query in init', done => {
      var data = { features: { flag: { key: "flag", version: 1 } } };
      client.query = (params, cb) => cb(err);
      store.init(data, function() {
        expect(logger.error).toHaveBeenCalled();
        done();
      });
    });

    it('error from batchWrite in init', done => {
      var data = { features: { flag: { key: "flag", version: 1 } } };
      client.query = (params, cb) => cb(null, { Items: [] });
      client.batchWrite = (params, cb) => cb(err);
      store.init(data, function() {
        expect(logger.error).toHaveBeenCalled();
        done();
      });
    });

    it('error from get', done => {
      client.get = (params, cb) => cb(err);
      store.get(dataKind.features, 'flag', function(result) {
        expect(result).toBe(null);
        expect(logger.error).toHaveBeenCalled();
        done();
      });
    });

    it('error from get all', done => {
      client.query = (params, cb) => cb(err);
      store.all(dataKind.features, function(result) {
        expect(result).toBe(null);
        expect(logger.error).toHaveBeenCalled();
        done();
      });
    });

    it('error from upsert', done => {
      client.put = (params, cb) => cb(err);
      store.upsert(dataKind.features, { key: 'flag', version: 1 }, function() {
        expect(logger.error).toHaveBeenCalled();
        done();
      });
    });

    it('error from initialized', done => {
      client.get = (params, cb) => cb(err);
      store.initialized(function(result) {
        expect(result).toBe(false);
        expect(logger.error).toHaveBeenCalled();
        done();
      });
    });
  });
});
