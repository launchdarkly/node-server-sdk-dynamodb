const { initState } = require('./dynamodb_helpers');
const { promisify } = require('util');

const keyMetadata = 'big_segments_metadata';
const keyUserData = 'big_segments_user';
const attrSyncTime = 'synchronizedOn';
const attrIncluded = 'included';
const attrExcluded = 'excluded';

// Note that the format of parameters in this implementation is a bit different than in the
// LD DynamoDB integrations for some other platforms, because we are using the
// AWS.DynamoDB.DocumentClient class, which represents values as simple types like
// string or number, rather than in the { S: stringValue } or { N: numericStringValue }
// format used by the basic AWS DynamoDB API.

function DynamoDBBigSegmentStore(tableName, maybeOptions) {
  const options = maybeOptions || {};
  return () => // config parameter is currently unused because we don't need to do any logging
    dynamoDBBigSegmentStoreImpl(tableName, options);
}

function dynamoDBBigSegmentStoreImpl(tableName, options) {
  const state = initState(options);
  const dynamoDBClient = state.client;
  const prefix = state.prefix;

  const store = {};

  // Pre-promisify for efficiency. Note that we have to add .bind(client) to each method when
  // when using promisify, because the AWS client methods don't work without a "this" context.
  const clientGet = promisify(dynamoDBClient.get.bind(dynamoDBClient));

  store.getMetadata = async () => {
    const key = prefix + keyMetadata;
    const data = await clientGet({
      TableName: tableName,
      Key: { namespace: key, key: key },
    });
    if (data.Item) {
      const attr = data.Item[attrSyncTime];
      if (attr) {
        return { lastUpToDate: attr };
      }
    }
    return { lastUpToDate: undefined };
  };
  
  store.getUserMembership = async userHashKey => {
    const data = await clientGet({
      TableName: tableName,
      Key: {
        namespace: prefix + keyUserData,
        key: userHashKey,
      },
    });
    const item = data.Item;
    if (item) {
      const membership = {};
      const excludedRefs = item[attrExcluded];
      const includedRefs = item[attrIncluded];
      // The actual type of these values in DynamoDB is a string set. The DocumentClient
      // returns string set values as a special type where the actual list of strings is
      // in a "values" property.
      if (excludedRefs && excludedRefs.values) {
        for (const ref of excludedRefs.values) {
          membership[ref] = false;
        }
      }
      if (includedRefs && includedRefs.values) {
        for (const ref of includedRefs.values) {
          membership[ref] = true;
        }
      }
      return membership;
    }
    return null;
  };

  store.close = function() {
    // The Node DynamoDB client is stateless, so close isn't a meaningful operation.
  };

  return store;
}

module.exports = {
  DynamoDBBigSegmentStore,
  keyMetadata,
  keyUserData,
  attrSyncTime,
  attrIncluded,
  attrExcluded,
};
