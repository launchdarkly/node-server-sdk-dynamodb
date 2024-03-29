const { DynamoDBBigSegmentStore, DynamoDBFeatureStore } = require('../index');
const {
  keyMetadata,
  keyUserData,
  attrSyncTime,
  attrIncluded,
  attrExcluded,
} = require('../dynamodb_big_segment_store');
const { batchWrite, optionalPrefix, paginationHelper } = require('../dynamodb_helpers');
const dataKind = require('launchdarkly-node-server-sdk/versioned_data_kind');
const {
  runPersistentFeatureStoreTests,
  runBigSegmentStoreTests,
} = require('launchdarkly-node-server-sdk/sharedtest/store_tests');
const AWS = require('aws-sdk');
const { promisify } = require('util');
const { asyncSleep, promisifySingle } = require('launchdarkly-js-test-helpers');

// Runs the standard test suites provided by the SDK's store_tests module, plus some additional
// tests specific to this package.

// This is a single file because if the two test suites were run from separate files, they could
// be interleaved by Jest. Since our implementation of clearAllData is not very smart and will
// remove *all* keys with the given prefix, we could step on another test's data if the shared
// test suites happen to use the same prefix.

AWS.config.update({
  credentials: { accessKeyId: 'fake', secretAccessKey: 'fake' },
  region: 'us-west-2',
  endpoint: 'http://localhost:8000'
});

const dynamodb = new AWS.DynamoDB();
const client = new AWS.DynamoDB.DocumentClient();

const testTableName = 'test-store';

async function clearData(prefix) {
  const actualPrefix = optionalPrefix(prefix);
  const ops = [];
  const items = await paginationHelper({TableName: testTableName}, function (params, cb) { client.scan(params, cb); });
  for (var i = 0; i < items.length; i++) {
    if (!actualPrefix || items[i].namespace.startsWith(actualPrefix)) {
      ops.push({
        DeleteRequest: {
          TableName: testTableName,
          Key: {
            namespace: items[i].namespace,
            key: items[i].key,
          },
        },
      });
    }
  }
  await Promise.all(batchWrite(client, testTableName, ops));
}

describe('DynamoDBFeatureStore', function() {
  beforeAll(function(done) {
    setupTable().then(done);
  });

  function createStore(prefix, cacheTTL, logger) {
    return DynamoDBFeatureStore(testTableName, { prefix, cacheTTL })({ logger });
  }

  function createStoreWithConcurrentUpdateHook(prefix, logger, hook) {
    const store = createStore(prefix, 0, logger);
    store.underlyingStore.testUpdateHook = hook;
    return store;
  }

  runPersistentFeatureStoreTests(
    createStore,
    clearData,
    createStoreWithConcurrentUpdateHook,
  );

  describe('handling errors from DynamoDB client', function() {
    const err = new Error('error');
    let client;
    let logger;
    let store;

    beforeEach(() => {
      client = {};
      logger = stubLogger();
      store = DynamoDBFeatureStore(testTableName, { dynamoDBClient: client })({ logger });
    });

    it('error from query in init', async () => {
      var data = { features: { flag: { key: 'flag', version: 1 } } };
      client.query = (params, cb) => cb(err);
      await promisifySingle(store.init)(data);
      expect(logger.error).toHaveBeenCalled();
    });

    it('error from batchWrite in init', async () => {
      var data = { features: { flag: { key: 'flag', version: 1 } } };
      client.query = (params, cb) => cb(null, { Items: [] });
      client.batchWrite = (params, cb) => cb(err);
      await promisifySingle(store.init)(data);
      expect(logger.error).toHaveBeenCalled();
    });

    it('error from get', async () => {
      client.get = (params, cb) => cb(err);
      const result = await promisifySingle(store.get)(dataKind.features, 'flag');
      expect(result).toBe(null);
      expect(logger.error).toHaveBeenCalled();
    });

    it('error from get all', async () => {
      client.query = (params, cb) => cb(err);
      const result = await promisifySingle(store.all)(dataKind.features);
      expect(result).toBe(null);
      expect(logger.error).toHaveBeenCalled();
    });

    it('error from upsert', async () => {
      client.put = (params, cb) => cb(err);
      await promisifySingle(store.upsert)(dataKind.features, { key: 'flag', version: 1 });
      expect(logger.error).toHaveBeenCalled();
    });

    it('error from initialized', async () => {
      client.get = (params, cb) => cb(err);
      const result = await promisifySingle(store.initialized)();
      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('items over the data size limit', () => {
    let logger;
    let store;

    beforeEach(() => {
      logger = stubLogger();
      store = DynamoDBFeatureStore(testTableName, { cacheTTL: 0 })({ logger });
      // Here we're disabling caching because we want to see if the data is really put into the database. If
      // there's a cache, data could be stored in and retrieved from the cache even though the data was too
      // big to go into the database.
    });

    function makeGoodData() {
      return {
        features: {
          flag1: { key: 'flag1', version: 1 },
          flag2: { key: 'flag2', version: 1 }
        },
        segments: {
          segment1: { key: 'segment1', version: 1 },
          segment2: { key: 'segment2', version: 1 },
        }
      };
    }

    async function getAllData() {
      const flags = await promisifySingle(store.all)(dataKind.features);
      const segments = await promisifySingle(store.all)(dataKind.segments);
      return { features: flags, segments: segments };
    }

    function makeBigKeyList() {
      const ret = [];
      for (let i = 0; i < 40000; i++) {
        ret.push('key' + i);
      }
      expect(JSON.stringify(ret).length).toBeGreaterThan(400 * 1024);
      return ret;
    }

    function makeTooBigFlag() {
      return { key: 'flag1a', version: 1, targets: [{ variation: 0, values: makeBigKeyList() }] };
    }

    function makeTooBigSegment() {
      return { key: 'segment1a', version: 1, included: makeBigKeyList() };
    }
    
    function expectSizeLimitErrorLog(logger) {
      expect(logger.error.mock.calls.length).toBe(1);
      expect(logger.error.mock.calls[0][0]).toContain('was too large to store in DynamoDB and was dropped');
    }

    describe('skips and logs too-large item in init', () => {
      async function testInit(kind, item) {
        await clearData();

        const data = makeGoodData();
        data[kind.namespace][item.key] = item;  
        await promisifySingle(store.init)(data);

        expectSizeLimitErrorLog(logger);
        expect(await getAllData()).toEqual(makeGoodData());
      }

      it('flag', async () => {
        await testInit(dataKind.features, makeTooBigFlag());
      });
      
      it('segment', async () => {
        await testInit(dataKind.segments, makeTooBigSegment());
      });
    });

    describe('skips and logs too-large item in upsert', () => {
      async function testUpsert(kind, item) {
        await clearData();

        const data = makeGoodData();
        await promisifySingle(store.init)(data);
        expect(logger.error).not.toHaveBeenCalled();
        expect(await getAllData()).toEqual(makeGoodData());

        await promisify(store.upsert)(kind, item);

        expectSizeLimitErrorLog(logger);
        expect(await getAllData()).toEqual(makeGoodData());
      }

      it('flag', async () => {
        await testUpsert(dataKind.features, makeTooBigFlag());
      });
      
      it('segment', async () => {
        await testUpsert(dataKind.segments, makeTooBigSegment());
      });
    });
  });
});

describe('DynamoDBBigSegmentStore', function() {
  beforeAll(function(done) {
    setupTable().then(done);
  });

  function createStore(prefix, logger) {
    return DynamoDBBigSegmentStore(testTableName, { prefix })({ logger });
  }

  async function setMetadata(prefix, metadata) {
    const key = optionalPrefix(prefix) + keyMetadata;
    const params = {
      TableName: testTableName,
      Item: {
        namespace: key,
        key: key,
        [attrSyncTime]: metadata.lastUpToDate,
      },
    };
    await promisify(client.put.bind(client))(params);
  }

  async function setSegments(prefix, userHashKey, includes, excludes) {
    const addToSet = async (attrName, value) => {
      await promisify(client.update.bind(client))({
        TableName: testTableName,
        Key: {
          namespace: optionalPrefix(prefix) + keyUserData,
          key: userHashKey,
        },
        UpdateExpression: 'ADD ' + attrName + ' :value',
        ExpressionAttributeValues: {
          ':value': client.createSet([value]),
        },
      });
    };
    if (includes) {
      for (const ref of includes) {
        await addToSet(attrIncluded, ref);
      }
    }
    if (excludes) {
      for (const ref of excludes) {
        await addToSet(attrExcluded, ref);
      }
    }
  }

  runBigSegmentStoreTests(createStore, clearData, setMetadata, setSegments);
});

async function setupTable() {
  try {
    await promisify(dynamodb.describeTable.bind(dynamodb))({ TableName: testTableName });
    return; // no error = it already exists
  } catch (e) {} // eslint-disable-line no-empty

  const params = {
    TableName: testTableName,
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
    },
  };

  await promisify(dynamodb.createTable.bind(dynamodb))(params);
  await waitForTable();
}

async function waitForTable() {
  while (true) { // eslint-disable-line no-constant-condition
    try {
      await promisify(dynamodb.describeTable.bind(dynamodb))({ TableName: testTableName });
      return; // no error = testTableName exists
    } catch (e) {
      if (e.code === 'ResourceNotFoundException') {
        await asyncSleep(100);
        continue;
      }
      throw e;
    }
  }
}

function stubLogger() {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };
}
