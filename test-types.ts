
// This file exists only so that we can run the TypeScript compiler in the CI build
// to validate our index.d.ts file.

import DynamoDBFeatureStore, { LDDynamoDBOptions } from 'launchdarkly-node-server-sdk-dynamodb';
import { LDLogger } from 'launchdarkly-node-server-sdk';
import { DynamoDB } from 'aws-sdk';

var emptyOptions: LDDynamoDBOptions = {};

var ddbOptions: DynamoDB.DocumentClient.DocumentClientOptions = {};
var ddbClient: DynamoDB.DocumentClient = new DynamoDB.DocumentClient();
var logger: LDLogger = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} };

var options: LDDynamoDBOptions = {
	clientOptions: ddbOptions,
	dynamoDBClient: ddbClient,
	prefix: 'x',
	cacheTTL: 30,
	logger: logger
};
