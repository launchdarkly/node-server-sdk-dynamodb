# LaunchDarkly Server-Side SDK for Node.js - DynamoDB integration

# :warning: Important note

This integration in this does not work with version 8.0+ of the Node.js Server-Side SDK. Future development of this integration will be done here [node-server-sdk-dynamodb](https://github.com/launchdarkly/js-core/tree/main/packages/store/node-server-sdk-dynamodb). Please note the package has also been renamed from `launchdarkly-node-server-sdk-dynamodb` to `@launchdarkly/node-server-sdk-dynamodb`.

As mentioned in the [node server sdk changelog](https://github.com/launchdarkly/node-server-sdk/blob/main/CHANGELOG.md), the `launchdarkly-node-server-sdk` project has been renamed to `@launchdarkly/node-server-sdk`. All future releases will be made from the [new repository](https://github.com/launchdarkly/js-core/tree/main/packages/sdk/server-node). Please consider upgrading and filing potential requests in that repository's [issue tracker](https://github.com/launchdarkly/js-core/issues?q=is%3Aissue+is%3Aopen+label%3A%22package%3A+sdk%2Fserver-node%22+sort%3Aupdated-desc).

[![CircleCI](https://circleci.com/gh/launchdarkly/node-server-sdk-dynamodb.svg?style=svg)](https://circleci.com/gh/launchdarkly/node-server-sdk-dynamodb)

This library provides a DynamoDB-backed persistence mechanism (feature store) for the [LaunchDarkly Node.js SDK](https://github.com/launchdarkly/node-server-sdk), replacing the default in-memory feature store. It uses the AWS SDK for Node.js.

The minimum version of the LaunchDarkly Node.js SDK for use with this library is 6.2.0.

For more information, read the [SDK features guide](https://docs.launchdarkly.com/sdk/features/storing-data).

TypeScript API documentation is [here](https://launchdarkly.github.io/node-server-sdk-dynamodb).

## Quick setup

This assumes that you have already installed the LaunchDarkly Node.js SDK.

1. In DynamoDB, create a table which has the following schema: a partition key called "namespace" and a sort key called "key", both with a string type. The LaunchDarkly library does not create the table automatically, because it has no way of knowing what additional properties (such as permissions and throughput) you would want it to have.

2. Install this package with `npm`:

        npm install launchdarkly-node-server-sdk-dynamodb --save

3. If your application does not already have its own dependency on the `aws-sdk` package, and if it will _not_ be running in AWS Lambda, add `aws-sdk` as well:

        npm install aws-sdk --save

    The `launchdarkly-node-server-sdk-dynamodb` package does not provide `aws-sdk` as a transitive dependency, because it is provided automatically by the Lambda runtime and this would unnecessarily increase the size of applications deployed in Lambda. Therefore, if you are not using Lambda you need to provide `aws-sdk` separately.

4. Require the package:

        const { DynamoDBFeatureStore } = require('launchdarkly-node-server-sdk-dynamodb');

5. When configuring your SDK client, add the DynamoDB feature store:

        const store = DynamoDBFeatureStore('YOUR TABLE NAME');
        const config = { featureStore: store };
        const client = LaunchDarkly.init('YOUR SDK KEY', config);

    By default, the DynamoDB client will try to get your AWS credentials and region name from environment variables and/or local configuration files, as described in the AWS SDK documentation. You can also specify any valid [DynamoDB client options](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB.html#constructor-property) like this:

        const dynamoDBOptions = { accessKeyId: 'YOUR KEY', secretAccessKey: 'YOUR SECRET' };
        const store = DynamoDBFeatureStore('YOUR TABLE NAME', { clientOptions: dynamoDBOptions });

    Alternatively, if you already have a fully configured DynamoDB client object, you can tell LaunchDarkly to use that:

        const store = DynamoDBFeatureStore('YOUR TABLE NAME', { dynamoDBClient: myDynamoDBClientInstance });

6. If you are running a [LaunchDarkly Relay Proxy](https://github.com/launchdarkly/ld-relay) instance, or any other process that will prepopulate the DynamoDB table with feature flags from LaunchDarkly, you can use [daemon mode](https://github.com/launchdarkly/ld-relay#daemon-mode), so that the SDK retrieves flag data only from DynamoDB and does not communicate directly with LaunchDarkly. This is controlled by the SDK's `useLdd` option:

        const config = { featureStore: store, useLdd: true };
        const client = LaunchDarkly.init('YOUR SDK KEY', config);

7. If the same DynamoDB table is being shared by SDK clients for different LaunchDarkly environments, set the `prefix` option to a different short string for each one to keep the keys from colliding:

        const store = DynamoDBFeatureStore('YOUR TABLE NAME', { prefix: 'env1' });

## Caching behavior

To reduce traffic to DynamoDB, there is an optional in-memory cache that retains the last known data for a configurable amount of time. This is on by default; to turn it off (and guarantee that the latest feature flag data will always be retrieved from DynamoDB for every flag evaluation), configure the store as follows:

        const store = DynamoDBFeatureStore('YOUR TABLE NAME', { cacheTTL: 0 });

## Data size limitation

DynamoDB has [a 400KB limit](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/ServiceQuotas.html#limits-items) on the size of any data item. For the LaunchDarkly SDK, a data item consists of the JSON representation of an individual feature flag or segment configuration, plus a few smaller attributes. You can see the format and size of these representations by querying `https://sdk.launchdarkly.com/flags/latest-all` and setting the `Authorization` header to your SDK key.

Most flags and segments won't be nearly as big as 400KB, but they could be if for instance you have a long list of user keys for individual user targeting. If the flag or segment representation is too large, it cannot be stored in DynamoDB. To avoid disrupting storage and evaluation of other unrelated feature flags, the SDK will simply skip storing that individual flag or segment, and will log a message (at ERROR level) describing the problem. For example:

```
    The item "my-flag-key" in "features" was too large to store in DynamoDB and was dropped
```

If caching is enabled in your configuration, the flag or segment may still be available in the SDK from the in-memory cache, but do not rely on this. If you see this message, consider redesigning your flag/segment configurations, or else do not use DynamoDB for the environment that contains this data item.

This limitation does not apply to target lists in [Big Segments](https://docs.launchdarkly.com/home/users/big-segments/).

A future version of the LaunchDarkly DynamoDB integration may use different strategies to work around this limitation, such as compressing the data or dividing it into multiple items. However, this integration is required to be interoperable with the DynamoDB integrations used by all the other LaunchDarkly SDKs and by the Relay Proxy, so any such change will only be made as part of a larger cross-platform release.

## About LaunchDarkly

* LaunchDarkly is a continuous delivery platform that provides feature flags as a service and allows developers to iterate quickly and safely. We allow you to easily flag your features and manage them from the LaunchDarkly dashboard.  With LaunchDarkly, you can:
    * Roll out a new feature to a subset of your users (like a group of users who opt-in to a beta tester group), gathering feedback and bug reports from real-world use cases.
    * Gradually roll out a feature to an increasing percentage of users, and track the effect that the feature has on key metrics (for instance, how likely is a user to complete a purchase if they have feature A versus feature B?).
    * Turn off a feature that you realize is causing performance problems in production, without needing to re-deploy, or even restart the application with a changed configuration file.
    * Grant access to certain features based on user attributes, like payment plan (eg: users on the ‘gold’ plan get access to more features than users in the ‘silver’ plan). Disable parts of your application to facilitate maintenance, without taking everything offline.
* LaunchDarkly provides feature flag SDKs for a wide variety of languages and technologies. Check out [our documentation](https://docs.launchdarkly.com/sdk) for a complete list.
* Explore LaunchDarkly
    * [launchdarkly.com](https://www.launchdarkly.com/ "LaunchDarkly Main Website") for more information
    * [docs.launchdarkly.com](https://docs.launchdarkly.com/  "LaunchDarkly Documentation") for our documentation and SDK reference guides
    * [apidocs.launchdarkly.com](https://apidocs.launchdarkly.com/  "LaunchDarkly API Documentation") for our API documentation
    * [blog.launchdarkly.com](https://blog.launchdarkly.com/  "LaunchDarkly Blog Documentation") for the latest product updates
