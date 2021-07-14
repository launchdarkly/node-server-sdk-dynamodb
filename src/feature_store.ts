import { BaseDynamoDB } from './base';
import { batchWrite, queryHelper } from './base';
import { DataKind, DataCollection, KeyedItems, VersionedData } from './feature_store_types';
import { LDDynamoDBOptions } from './options';

import { LDFeatureStore, LDLogger, LDOptions } from 'launchdarkly-node-server-sdk';
import * as CachingStoreWrapper from 'launchdarkly-node-server-sdk/caching_store_wrapper';
import { promisify } from 'util';

const defaultCacheTTLSeconds = 15;

// Note that the format of parameters in this implementation is a bit different than in the
// LD DynamoDB integrations for some other platforms, because we are using the
// AWS.DynamoDB.DocumentClient class, which represents values as simple types like
// string or number, rather than in the { S: stringValue } or { N: numericStringValue }
// format used by the basic AWS DynamoDB API.

/**
 * Create a feature flag store backed by DynamoDB.
 * 
 * @param tableName The table name in DynamoDB (required). The table must already exist.
 *   See: https://docs.launchdarkly.com/sdk/features/storing-data/dynamodb
 * @param options Additional options for configuring the DynamoDB store's behavior.
 *
 * @returns
 *   A factory function that the SDK will use to create the data store. Put this value into the
 *   `featureStore` property of [[LDOptions]].
 */
export function DynamoDBFeatureStore(
  tableName: string,
  options?: LDDynamoDBOptions,
): (config: LDOptions) => LDFeatureStore {
  const allOptions = options || {};
  const ttl = allOptions.cacheTTL !== null && allOptions.cacheTTL !== undefined
    ? allOptions.cacheTTL
    : defaultCacheTTLSeconds;
  return config =>
    new CachingStoreWrapper(
      new DynamoDBFeatureStoreImpl(tableName, options, config.logger),
      ttl,
      'DynamoDB'
    );
}

export class DynamoDBFeatureStoreImpl { // exported for tests only
  public testUpdateHook: (callback: () => void) => void; // exposed for tests

  private base: BaseDynamoDB;
  private client: AWS.DynamoDB.DocumentClient;
  private prefix: string;

  // Pre-promisify these methods for efficiency
  private clientGet: (params: AWS.DynamoDB.DocumentClient.GetItemInput) => Promise<AWS.DynamoDB.DocumentClient.GetItemOutput>;
  private clientPut: (params: AWS.DynamoDB.DocumentClient.PutItemInput) => Promise<AWS.DynamoDB.DocumentClient.PutItemOutput>;

  constructor(public tableName: string, options: LDDynamoDBOptions, public logger: LDLogger) {
    this.base = new BaseDynamoDB(options);
    this.client = this.base.client;
    this.prefix = this.base.prefix;

    // Pre-promisify for efficiency. Note that we have to add .bind(client) to each method when
    // when using promisify, because the AWS client methods don't work without a "this" context.
    this.clientGet = promisify(this.client.get.bind(this.client));
    this.clientPut = promisify(this.client.put.bind(this.client));
  }

  public getInternal(kind: DataKind, key: string, callback: (item?: VersionedData) => void): void {
    (async () => {
      try {
        const data = await this.clientGet({
          TableName: this.tableName,
          Key: {
            namespace: this.namespaceForKind(kind),
            key: key,
          }
        });
        if (data && data.Item) {
          callback(this.unmarshalItem(data.Item));
        } else {
          callback(null);
        }
      } catch (err) {
        this.logger.error(`failed to get: ${err}`);
        callback(null);
      }
    })();
  }

  public getAllInternal(kind: DataKind, callback: (items: KeyedItems) => void): void {
    const params = this.queryParamsForNamespace(kind.namespace);
    (async () => {
      try {
        const items = await queryHelper(this.client, params);
        const results: KeyedItems = {};
        for (const dbItem of items) {
          const item = this.unmarshalItem(dbItem);
          if (item) {
            results[item.key] = item;
          }
        }
        callback(results);
      } catch (err) {
        this.logger.error(`failed to get all ${kind.namespace}: ${err}`);
        callback(null);
      }
    })();
  }

  public initOrderedInternal(allData: Array<DataCollection>, callback: () => void): void {
    (async () => {
      try {
        const existingItems = await this.readExistingItems(allData);
        const existingNamespaceKeys = {};
        for (const existingItem of existingItems) {
          existingNamespaceKeys[DynamoDBFeatureStoreImpl.makeNamespaceKey(existingItem)] = true;
        }
        delete existingNamespaceKeys[DynamoDBFeatureStoreImpl.makeNamespaceKey(this.initializedToken())];
        
        // Write all initial data (without version checks).
        const ops = [];
        for (const collection of allData) {
          for (const item of collection.items) {
            const key = item.key;
            delete existingNamespaceKeys[this.namespaceForKind(collection.kind) + '$' + key];
            ops.push({ PutRequest: { Item: this.marshalItem(collection.kind, item) } });
          }
        }

        // Remove existing data that is not in the new list.
        for (const namespaceKey in existingNamespaceKeys) {
          const namespaceAndKey = namespaceKey.split('$');
          ops.push({ DeleteRequest: { Key: { namespace: namespaceAndKey[0], key: namespaceAndKey[1] } } });
        }

        // Always write the initialized token when we initialize.
        ops.push({ PutRequest: { Item: this.initializedToken() } });

        const writePromises = batchWrite(this.client, this.tableName, ops);
    
        await Promise.all(writePromises);
        callback();
      } catch (err) {
        this.logger.error(`failed to initialize: ${err}`);
        callback();
      }
    })();
  }

  public upsertInternal(
    kind: DataKind,
    item: VersionedData,
    callback: (err: Error, finalItem: VersionedData) => void,
  ): void {
    const params = this.makeVersionedPutRequest(kind, item);

    (async () => {
      // testUpdateHook is instrumentation, used only by the unit tests
      if (this.testUpdateHook) {
        await new Promise<void>(this.testUpdateHook);
      }

      try {
        await this.clientPut(params);
        callback(null, item);
      } catch (err) {
        if (err.code !== 'ConditionalCheckFailedException') {
          this.logger.error(`failed to upsert: ${err}`);
          callback(err, null);
          return;
        }
        this.getInternal(kind, item.key, existingItem => {
          callback(null, existingItem);
        });
        return;
      }
    })();
  }

  public initializedInternal(callback: (result: boolean) => void): void {
    const token = this.initializedToken();
    (async () => {
      try {
        const data = await this.clientGet({
          TableName: this.tableName,
          Key: token,
        });
        const inited = data.Item && data.Item.key === token.key;
        callback(!!inited);
      } catch (err) {
        this.logger.error(err);
        callback(false);
      }
    })();
  }

  public close(): void {
    // The Node DynamoDB client is stateless, so close isn't a meaningful operation.
  }

  private queryParamsForNamespace(namespace: string): AWS.DynamoDB.DocumentClient.QueryInput {
    return {
      TableName: this.tableName,
      KeyConditionExpression: 'namespace = :namespace',
      FilterExpression: 'attribute_not_exists(deleted) OR deleted = :deleted',
      ExpressionAttributeValues: { ':namespace': this.prefix + namespace, ':deleted': false }
    };
  }

  private async readExistingItems(allData: Array<DataCollection>): Promise<AWS.DynamoDB.ItemList> {
    let ret: AWS.DynamoDB.ItemList = [];
    for (const collection of allData) {
      const namespace = collection.kind.namespace;
      const params = this.queryParamsForNamespace(namespace);
      const items = await queryHelper(this.client, params);
      ret = ret.concat(items);
    }
    return ret;
  }

  private namespaceForKind(kind: DataKind): string {
    return this.prefix + kind.namespace;
  }

  private initializedToken() {
    const value = this.prefix + '$inited';
    return { namespace: value, key: value };
  }

  private marshalItem(kind: DataKind, item: VersionedData): AWS.DynamoDB.DocumentClient.AttributeMap {
    return {
      namespace: this.namespaceForKind(kind),
      key: item.key,
      version: item.version,
      item: JSON.stringify(item)
    };
  }

  private unmarshalItem(dbItem: AWS.DynamoDB.DocumentClient.AttributeMap): VersionedData {
    const itemJson = dbItem.item;
    if (itemJson) {
      try {
        return JSON.parse(itemJson);
      } catch(e) {
        this.logger.error('database item did not contain a valid JSON object');
      }
    }
    return null;
  }

  private makeVersionedPutRequest(kind: DataKind, item: VersionedData): AWS.DynamoDB.DocumentClient.PutItemInput {
    return {
      TableName: this.tableName,
      Item: this.marshalItem(kind, item),
      ConditionExpression: 'attribute_not_exists(version) OR version < :new_version',
      ExpressionAttributeValues: {':new_version': item.version }
    };
  }

  private static makeNamespaceKey(item: AWS.DynamoDB.DocumentClient.AttributeMap) {
    return item.namespace + '$' + item.key;
  }
}
