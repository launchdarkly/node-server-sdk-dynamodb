var AWS = require('aws-sdk');

var dynamodb = new AWS.DynamoDB();

var table='test-store';

// TODO move this example to README
var params = {
  TableName : table,
  KeySchema: [       
    { AttributeName: 'namespace', KeyType: 'HASH'},  //Partition key
    { AttributeName: 'key', KeyType: 'RANGE' }  //Sort key
  ],
  AttributeDefinitions: [       
    { AttributeName: 'namespace', AttributeType: 'S' },
    { AttributeName: 'key', AttributeType: 'S' }
  ],
};

dynamodb.createTable(params, function(err, data) {
  if (err) {
    console.error('Unable to create table. Error JSON:', JSON.stringify(err, null, 2));
  } else {
    console.log('Created table. Table description JSON:', JSON.stringify(data, null, 2));
  }
});

