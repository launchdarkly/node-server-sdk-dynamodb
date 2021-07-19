import { batchWrite, optionalPrefix, paginationHelper } from '../src/base';
import { keyMetadata, keyUserData, attrSyncTime, attrIncluded, attrExcluded } from '../src/big_segment_store';
import { DynamoDBFeatureStoreImpl } from '../src/feature_store';
import { DynamoDBBigSegmentStore, DynamoDBFeatureStore } from '../src/index';

import * as AWS from 'aws-sdk';
import { sleepAsync } from 'launchdarkly-js-test-helpers';
import { LDLogger } from 'launchdarkly-node-server-sdk';
import * as dataKind from 'launchdarkly-node-server-sdk/versioned_data_kind';
import {
  runBigSegmentStoreTests,
  runPersistentFeatureStoreTests,
} from 'launchdarkly-node-server-sdk/sharedtest/store_tests';

import { promisify } from 'util';

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
}, true);

const dynamodb = new AWS.DynamoDB();
const client = new AWS.DynamoDB.DocumentClient();

const testTableName = 'test-store';

async function clearData(prefix) {
  const actualPrefix = optionalPrefix(prefix);
  const ops = [];
  const items: AWS.DynamoDB.DocumentClient.ItemList =
    await paginationHelper({TableName: testTableName}, params => promisify(client.scan.bind(client))(params));
  for (const item of items) {
    if (!actualPrefix || item.namespace.startsWith(actualPrefix)) {
      ops.push({
        DeleteRequest: {
          TableName: testTableName,
          Key: {
            namespace: item.namespace,
            key: item.key,
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

  function createStore(prefix: string, cacheTTL: number, logger: LDLogger) {
    return DynamoDBFeatureStore(testTableName, { prefix, cacheTTL })({ logger });
  }

  function createStoreWithConcurrentUpdateHook(
    prefix: string,
    logger: LDLogger,
    hook: (callback: () => void) => void,
  ) {
    const store = createStore(prefix, 0, logger);

    // Undocumented 'underlyingStore' property is currently the only way to access the RedisFeatureStoreImpl;
    // however, eslint does not like the 'object' typecast
    /* eslint-disable @typescript-eslint/ban-types */
    ((store as object)['underlyingStore'] as DynamoDBFeatureStoreImpl).testUpdateHook = hook;
    /* eslint-enable @typescript-eslint/ban-types */

    return store;
  }

  runPersistentFeatureStoreTests(
    createStore,
    clearData,
    createStoreWithConcurrentUpdateHook,
  );

  describe('handling errors from DynamoDB client', function() {
    const err = new Error('error');
    let client: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    let logger: LDLogger;

    beforeEach(() => {
      client = {
        get: () => {}, // eslint-disable-line @typescript-eslint/no-empty-function
        put: () => {}, // eslint-disable-line @typescript-eslint/no-empty-function
        query: () => {}, // eslint-disable-line @typescript-eslint/no-empty-function
      };
      logger = stubLogger();
    });

    it('error from query in init', done => {
      const data = { features: { flag: { key: 'flag', version: 1 } } };
      
      client.query = (params, cb) => cb(err);
      const store = DynamoDBFeatureStore(testTableName, { dynamoDBClient: client })({ logger });

      store.init(data, function() {
        expect(logger.error).toHaveBeenCalled();
        done();
      });
    });

    it('error from batchWrite in init', done => {
      const data = { features: { flag: { key: 'flag', version: 1 } } };

      client.query = (params, cb) => cb(null, { Items: [] });
      const store = DynamoDBFeatureStore(testTableName, { dynamoDBClient: client })({ logger });

      client.batchWrite = (params, cb) => cb(err);
      store.init(data, function() {
        expect(logger.error).toHaveBeenCalled();
        done();
      });
    });

    it('error from get', done => {
      client.get = (params, cb) => cb(err);
      const store = DynamoDBFeatureStore(testTableName, { dynamoDBClient: client })({ logger });

      store.get(dataKind.features, 'flag', function(result) {
        expect(result).toBe(null);
        expect(logger.error).toHaveBeenCalled();
        done();
      });
    });

    it('error from get all', done => {
      client.query = (params, cb) => cb(err);
      const store = DynamoDBFeatureStore(testTableName, { dynamoDBClient: client })({ logger });

      store.all(dataKind.features, function(result) {
        expect(result).toBe(null);
        expect(logger.error).toHaveBeenCalled();
        done();
      });
    });

    it('error from upsert', done => {
      client.put = (params, cb) => cb(err);
      const store = DynamoDBFeatureStore(testTableName, { dynamoDBClient: client })({ logger });

      store.upsert(dataKind.features, { key: 'flag', version: 1 }, function() {
        expect(logger.error).toHaveBeenCalled();
        done();
      });
    });

    it('error from initialized', done => {
      client.get = (params, cb) => cb(err);
      const store = DynamoDBFeatureStore(testTableName, { dynamoDBClient: client })({ logger });
      
      store.initialized(function(result) {
        expect(result).toBe(false);
        expect(logger.error).toHaveBeenCalled();
        done();
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
        await sleepAsync(100);
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
