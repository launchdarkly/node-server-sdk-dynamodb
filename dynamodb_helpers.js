const AWS = require('aws-sdk');

function optionalPrefix(prefix) {
  // Unlike some other database integrations where the key prefix is mandatory and has
  // a default value, in DynamoDB it is fine to not have a prefix. If there is one, we
  // prepend it to keys with a ':' separator.
  return prefix ? prefix + ':' : '';
}

function initState(options) {
  const state = {
    prefix: optionalPrefix(options.prefix)
  };

  if (options.dynamoDBClient) {
    state.client = options.dynamoDBClient;
  } else {
    state.client = new AWS.DynamoDB.DocumentClient(options.clientOptions);
  }
  // Unlike some other database integrations, we don't need to keep track of whether we
  // created our own client so as to shut it down later; the AWS client is stateless.
  
  return state;
}

function paginationHelper(params, executeFn, startKey) {
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
        paginationHelper(params, executeFn, data['LastEvaluatedKey']).then(function (nextPageItems) {
          resolve(data.Items.concat(nextPageItems));
        });
      } else {
        resolve(data.Items);
      }
    });
  });
}

function queryHelper(client, params, startKey) {
  return paginationHelper(params, function(params, cb) { return client.query(params, cb); }, startKey);
}

function batchWrite(client, tableName, ops) {
  var writePromises = [];
  // BatchWrite can only accept 25 items at a time, so split up the writes into batches of 25.
  for (var i = 0; i < ops.length; i += 25) {
    var requestItems = {};
    requestItems[tableName] = ops.slice(i, i+25);
    writePromises.push(new Promise(function(resolve, reject) {
      client.batchWrite({
        RequestItems: requestItems
      }, function(err) {
        err ? reject(err) : resolve();
      });
    }));
  }
  return writePromises;
}

module.exports = {
  initState,
  optionalPrefix,
  batchWrite,
  paginationHelper,
  queryHelper
};