import { BaseDynamoDB } from './base';
import { LDDynamoDBOptions } from './options';

import * as AWS from 'aws-sdk';
import * as ld from 'launchdarkly-node-server-sdk';
import { promisify } from 'util';

export const keyMetadata = 'big_segments_metadata';
export const keyUserData = 'big_segments_user';
export const attrSyncTime = 'synchronizedOn';
export const attrIncluded = 'included';
export const attrExcluded = 'excluded';

/**
 * Configures a big segment store backed by a Redis instance.
 *
 * "Big segments" are a specific type of user segments. For more information, read the
 * LaunchDarkly documentation about user segments: https://docs.launchdarkly.com/home/users
 *
 * @param options The standard options supported for all LaunchDarkly Redis features, including both
 *   options for Redis itself and others related to the SDK's behavior.
 *
 * @returns
 *   A factory function that the SDK will use to create the store. Put this value into the
 *   `store` property of [[ld.interfaces.BigSegmentsOptions]].
 */
export function DynamoDBBigSegmentStore(tableName: string, options?: LDDynamoDBOptions):
    (config: ld.LDOptions) => ld.interfaces.BigSegmentStore {
  return (config) => new BigSegmentStoreImpl(tableName, options || {}, config.logger);
}

class BigSegmentStoreImpl implements ld.interfaces.BigSegmentStore {
  private state: BaseDynamoDB;
  private client: AWS.DynamoDB.DocumentClient;
  private prefix: string;

  // Pre-promisify these methods for efficiency
  private clientGet: (params: AWS.DynamoDB.DocumentClient.GetItemInput) => Promise<AWS.DynamoDB.DocumentClient.GetItemOutput>;

  public constructor(public tableName: string, options: LDDynamoDBOptions, public logger: ld.LDLogger) {
    this.state = new BaseDynamoDB(options);
    this.client = this.state.client;
    this.prefix = this.state.prefix;

    // Pre-promisify for efficiency. Note that we have to add .bind(client) to each method when
    // when using promisify, because the AWS client methods don't work without a "this" context.
    this.clientGet = promisify(this.client.get.bind(this.client));
  }

  public async getMetadata(): Promise<ld.interfaces.BigSegmentStoreMetadata> {
    const key = this.prefix + keyMetadata;
    const data = await this.clientGet({
      TableName: this.tableName,
      Key: { namespace: key, key: key },
    });
    if (data.Item) {
      const attr = data.Item[attrSyncTime];
      if (attr) {
        return { lastUpToDate: attr };
      }
    }
    return { lastUpToDate: undefined };
  }

  public async getUserMembership(userHash: string): Promise<ld.interfaces.BigSegmentStoreMembership> {
    const data = await this.clientGet({
      TableName: this.tableName,
      Key: {
        namespace: this.prefix + keyUserData,
        key: userHash,
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
  }

  public close(): void {
    // The Node DynamoDB client is stateless, so close isn't a meaningful operation.
  }
}
