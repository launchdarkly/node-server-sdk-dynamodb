// Type definitions for launchdarkly-node-server-sdk-dynamodb

/**
 * Interface for the DynamoDB feature store component to be used with the LaunchDarkly SDK.
 *
 * See: https://docs.launchdarkly.com/v2.0/docs/using-a-persistent-feature-store
 */

declare module 'launchdarkly-node-server-sdk-dynamodb' {
  import { LDFeatureStore, LDLogger } from 'launchdarkly-node-server-sdk';
  import { DynamoDB } from 'aws-sdk';

  /**
   * Create a feature flag store backed by DynamoDB.
   */
  export default function DynamoDBFeatureStore(
    /**
     * The table name in DynamoDB. This table must already exist (see readme).
     */
    tableName: string,

    /**
     * Options for configuring the feature store.
     */
    options?: LDDynamoDBOptions
  ): LDFeatureStore;

  /**
   * Options for configuring a DynamoDBFeatureStore.
   */
  export interface LDDynamoDBOptions {
    /**
     * Options to be passed to the DynamoDB client constructor, as defined by the AWS SDK.
     */
    clientOptions?: DynamoDB.DocumentClient.DocumentClientOptions & DynamoDB.Types.ClientConfiguration;

    /**
     * Specifies an existing, already-configured DynamoDB client instance that the feature store
     * should use rather than creating one of its own. If you specify an existing client, then the
     * clientOptions property is ignored.
     */
    dynamoDBClient?: DynamoDB.DocumentClient;

    /**
     * An optional namespace prefix for all keys stored in DynamoDB. Use this if you are sharing
     * the same database table between multiple clients that are for different LaunchDarkly
     * environments, to avoid key collisions. 
     */
    prefix?: string;

    /**
     * The expiration time for local caching, in seconds. To disable local caching, set this to zero.
     * If not specified, the default is 15 seconds.
     */
    cacheTTL?: number;

    /**
     * A logger to be used for warnings and errors generated by the feature store. If not specified,
     * the default is an instance of winston.Logger.
     */
    logger?: LDLogger;
  }
}