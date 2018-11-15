LaunchDarkly SDK for Node.js - DynamoDB integration
===================================================
[![CircleCI](https://circleci.com/gh/launchdarkly/node-dynamodb-store.svg?style=svg)](https://circleci.com/gh/launchdarkly/node-dynamodb-store)

This library provides a DynamoDB-backed persistence mechanism (feature store) for the [LaunchDarkly Node.js SDK](https://github.com/launchdarkly/node-client), replacing the default in-memory feature store. It uses the AWS SDK for Node.js.

The minimum version of the LaunchDarkly Node.js SDK for use with this library is 5.6.0.

For more information, see also: [Using a persistent feature store](https://docs.launchdarkly.com/v2.0/docs/using-a-persistent-feature-store)

Quick setup
-----------

This assumes that you have already installed the LaunchDarkly Node.js SDK.

0. Install this package with `npm`

        npm install ldclient-node-dynamodb-store --save

1. Require the package:

        var DynamoDBFeatureStore = require('ldclient-node-dynamodb-store');

2. When configuring your SDK client, add the DynamoDB feature store:

        var store = DynamoDBFeatureStore('YOUR TABLE NAME');
        var config = { featureStore: store };
        var client = LaunchDarkly.init('YOUR SDK KEY', config);

The specified table must already exist in DynamoDB. It must have a partition key called "namespace" and a sort key called "key".

By default, the DynamoDB client will try to get your AWS credentials and region name from environment variables and/or local configuration files, as described in the AWS SDK documentation. You can also specify any valid [DynamoDB client options](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB.html#constructor-property) like this:

        var dynamoDBOptions = { accessKeyId: 'YOUR KEY', secretAccessKey: 'YOUR SECRET' };
        var store = DynamoDBFeatureStore('YOUR TABLE NAME', { clientOptions: dynamoDBOptions });

Alternatively, if you already have a fully configured DynamoDB client object, you can tell LaunchDarkly to use that:

        var store = DynamoDBFeatureStore('YOUR TABLE NAME', { dynamoDBClient: myDynamoDBClientInstance });

3. If you are running a [LaunchDarkly Relay Proxy](https://github.com/launchdarkly/ld-relay) instance, or any other process that will prepopulate the DynamoDB table with feature flags from LaunchDarkly, you can use [daemon mode](https://github.com/launchdarkly/ld-relay#daemon-mode), so that the SDK retrieves flag data only from DynamoDB and does not communicate directly with LaunchDarkly. This is controlled by the SDK's `useLdd` option:

        var config = { featureStore: store, useLdd: true };
        var client = LaunchDarkly.init('YOUR SDK KEY', config);

Caching behavior
----------------

To reduce traffic to DynamoDB, there is an optional in-memory cache that retains the last known data for a configurable amount of time. This is on by default; to turn it off (and guarantee that the latest feature flag data will always be retrieved from DynamoDB for every flag evaluation), configure the store as follows:

        var store = DynamoDBFeatureStore('YOUR TABLE NAME', { cacheTTL: 0 });

About LaunchDarkly
-----------

* LaunchDarkly is a continuous delivery platform that provides feature flags as a service and allows developers to iterate quickly and safely. We allow you to easily flag your features and manage them from the LaunchDarkly dashboard.  With LaunchDarkly, you can:
    * Roll out a new feature to a subset of your users (like a group of users who opt-in to a beta tester group), gathering feedback and bug reports from real-world use cases.
    * Gradually roll out a feature to an increasing percentage of users, and track the effect that the feature has on key metrics (for instance, how likely is a user to complete a purchase if they have feature A versus feature B?).
    * Turn off a feature that you realize is causing performance problems in production, without needing to re-deploy, or even restart the application with a changed configuration file.
    * Grant access to certain features based on user attributes, like payment plan (eg: users on the ‘gold’ plan get access to more features than users in the ‘silver’ plan). Disable parts of your application to facilitate maintenance, without taking everything offline.
* LaunchDarkly provides feature flag SDKs for
    * [Java](http://docs.launchdarkly.com/docs/java-sdk-reference "Java SDK")
    * [JavaScript](http://docs.launchdarkly.com/docs/js-sdk-reference "LaunchDarkly JavaScript SDK")
    * [PHP](http://docs.launchdarkly.com/docs/php-sdk-reference "LaunchDarkly PHP SDK")
    * [Python](http://docs.launchdarkly.com/docs/python-sdk-reference "LaunchDarkly Python SDK")
    * [Go](http://docs.launchdarkly.com/docs/go-sdk-reference "LaunchDarkly Go SDK")
    * [Node.JS](http://docs.launchdarkly.com/docs/node-sdk-reference "LaunchDarkly Node SDK")
    * [.NET](http://docs.launchdarkly.com/docs/dotnet-sdk-reference "LaunchDarkly .Net SDK")
    * [Ruby](http://docs.launchdarkly.com/docs/ruby-sdk-reference "LaunchDarkly Ruby SDK")
    * [iOS](http://docs.launchdarkly.com/docs/ios-sdk-reference "LaunchDarkly iOS SDK")
    * [Android](http://docs.launchdarkly.com/docs/android-sdk-reference "LaunchDarkly Android SDK")
* Explore LaunchDarkly
    * [launchdarkly.com](http://www.launchdarkly.com/ "LaunchDarkly Main Website") for more information
    * [docs.launchdarkly.com](http://docs.launchdarkly.com/  "LaunchDarkly Documentation") for our documentation and SDKs
    * [apidocs.launchdarkly.com](http://apidocs.launchdarkly.com/  "LaunchDarkly API Documentation") for our API documentation
    * [blog.launchdarkly.com](http://blog.launchdarkly.com/  "LaunchDarkly Blog Documentation") for the latest product updates
    * [Feature Flagging Guide](https://github.com/launchdarkly/featureflags/  "Feature Flagging Guide") for best practices and strategies
