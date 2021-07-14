import { LDDynamoDBOptions } from './options';

import * as AWS from 'aws-sdk';
import { promisify } from 'util';

export const defaultPrefix = 'launchdarkly';

export class BaseDynamoDB {
  public prefix: string;
  public client: AWS.DynamoDB.DocumentClient;

  public constructor(options: LDDynamoDBOptions) {
    this.prefix = optionalPrefix(options.prefix || defaultPrefix);

    if (options.dynamoDBClient) {
      this.client = options.dynamoDBClient;
    } else {
      this.client = new AWS.DynamoDB.DocumentClient(options.clientOptions);
    }
    // Unlike some other database integrations, we don't need to keep track of whether we
    // created our own client so as to shut it down later; the AWS client is stateless.
  }
}

export function optionalPrefix(prefix: string): string {
  // Unlike some other database integrations where the key prefix is mandatory and has
  // a default value, in DynamoDB it is fine to not have a prefix. If there is one, we
  // prepend it to keys with a ':' separator.
  return prefix ? prefix + ':' : '';
}

export interface PageableResult {
  Items: AWS.DynamoDB.DocumentClient.ItemList;
  LastEvaluatedKey?: string;
}

export async function paginationHelper<ParamsT>(
  params: ParamsT,
  executeFn: (params: ParamsT) => Promise<PageableResult>,
): Promise<AWS.DynamoDB.DocumentClient.ItemList> {
  let currentParams = params;
  let ret: AWS.DynamoDB.DocumentClient.ItemList = [];
  while (true) { // eslint-disable-line no-constant-condition
    const result = await executeFn(currentParams);
    ret = ret.concat(result.Items);
    if (!result.LastEvaluatedKey) {
      return ret;
    }
    currentParams = { ...currentParams, ExclusiveStartKey: result.LastEvaluatedKey };
  }
}

export async function queryHelper(
  client: AWS.DynamoDB.DocumentClient,
  params: AWS.DynamoDB.DocumentClient.QueryInput,
): Promise<AWS.DynamoDB.DocumentClient.ItemList> {
  return await paginationHelper(
    params,
    params => promisify(client.query.bind(client))(params),
  );
}

export function batchWrite(
  client: AWS.DynamoDB.DocumentClient,
  tableName: string,
  ops: Array<AWS.DynamoDB.DocumentClient.BatchWriteItemInput>,
): Array<Promise<void>> {
  const writePromises: Array<Promise<void>> = [];
  const batchWrite = promisify(client.batchWrite.bind(client));
  // BatchWrite can only accept 25 items at a time, so split up the writes into batches of 25.
  for (let i = 0; i < ops.length; i += 25) {
    const requestItems = {};
    requestItems[tableName] = ops.slice(i, i+25);
    writePromises.push(batchWrite({ RequestItems: requestItems }));
  }
  return writePromises;
}
