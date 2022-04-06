# Change log

All notable changes to the LaunchDarkly Node.js SDK DynamoDB integration will be documented in this file. This project adheres to [Semantic Versioning](http://semver.org).

## [4.0.1] - 2022-04-06
### Fixed:
- If the SDK attempts to store a feature flag or segment whose total data size is over the 400KB limit for DynamoDB items, this integration will now log (at `error` level) a message like `The item "my-flag-key" in "features" was too large to store in DynamoDB and was dropped` but will still process all other data updates. Previously, it would cause the SDK to enter an error state in which the oversized item would be pointlessly retried and other updates might be lost. ([#25](https://github.com/launchdarkly/node-server-sdk-dynamodb/issues/25))

## [4.0.0] - 2021-07-22
### Added:
- Added support for Big Segments. An Early Access Program for creating and syncing Big Segments from customer data platforms is available to enterprise customers.

### Changed:
- `DynamoDBFeatureStore` is now a named export, not a default export. This breaking change was made because the package now has an additional named export (`DynamoDBBigSegmentStore`). There are no other backward-incompatible changes in the package.

To update existing code for this version, change your imports like so:

```js
// BEFORE:
// CommonJS style
const DynamoDBFeatureStore = require(&#39;launchdarkly-node-server-sdk-dynamodb&#39;);
// or ES6 style
import DynamoDBFeatureStore from &#39;launchdarkly-node-server-sdk-dynamodb&#39;;

// AFTER:
// CommonJS style
const { DynamoDBFeatureStore } = require(&#39;launchdarkly-node-server-sdk-dynamodb&#39;);
// or ES6 style
import { DynamoDBFeatureStore } from &#39;launchdarkly-node-server-sdk-dynamodb&#39;;
```

## [3.0.0] - 2021-06-17
The 3.0.0 release of `launchdarkly-node-server-sdk-dynamodb` is for use with version 6.x of the LaunchDarkly server-side SDK for Node.js. It has the same functionality as the previous major version, but its dependencies, Node version compatibility, and internal API have been updated to match the 6.0.0 release of the SDK.

This version still uses the v2 AWS SDK. A future version will provide compatibility with the v3 AWS SDK; but as of this release, the v2 AWS SDK is still what is bundled in AWS Lambda runtimes, so using it allows Lambda code bundles to be smaller.

### Changed:
- The minimum Node.js version is now 12.
- The package no longer has a dependency on `winston`. It still allows you to configure a custom logger, but if you do not, it will use whatever logging configuration the SDK is using.

## [2.0.0] - 2020-04-03
### Changed:
- The `aws-sdk` dependency has been changed to a _peer_ dependency, so it is not automatically loaded by NPM. This greatly reduces application bundle size when deploying to AWS Lambda, because Lambda provides `aws-sdk` automatically in the container environment. Applications that do not run in Lambda must now add `aws-sdk` explicitly in their own dependencies in order to use this package. ([#12](https://github.com/launchdarkly/node-server-sdk-dynamodb/issues/12))

## [1.1.9] - 2020-03-25
### Removed:
- The package dependencies mistakenly included `typedoc`. ([#12](https://github.com/launchdarkly/node-server-sdk-dynamodb/issues/12))

## [1.1.8] - 2020-02-12
### Fixed:
- If diagnostic events are enabled (in Node SDK 5.11.0 and above), the SDK will correctly report its data store type as &#34;DynamoDB&#34; rather than &#34;custom&#34;. This change has no effect in earlier versions of the Node SDK.

## [1.1.7] - 2019-08-18
### Added:
- Generated HTML documentation.

## [1.1.6] - 2019-08-16
### Fixed:
- The package could not be used from TypeScript due to a mislabeled default export. (Thanks, [duro](https://github.com/launchdarkly/node-server-sdk-dynamodb/pull/9)!)


## [1.1.5] - 2019-05-14
### Changed:
- Corresponding to the SDK package name change from `ldclient-node` to `launchdarkly-node-server-sdk`, this package is now called `launchdarkly-node-server-sdk-dynamodb`. The functionality of the package, including the namespaces and class names, has not changed.

## [1.1.4] - 2019-01-25
### Fixed:
- Fixed a bug that could cause a database error when overwriting the entire data set with new data, if there is a key prefix.
- Fixed a bug that could produce an unhandled promise rejection if there was a database error.

## [1.1.3] - 2019-01-16
### Fixed:
- The fix in 1.1.2 was incomplete, causing some operations to still fail when there is a prefix.

## [1.1.2] - 2019-01-16
### Fixed:
- The prefix property added in 1.1.0 did not work correctly: data was written with prefixed keys, but was read with non-prefixed keys. This has been fixed.

## [1.1.1] - 2019-01-14
### Fixed:
- Fixed a potential race condition that could occur if one process is reading a feature flag while another one is updating the entire data set.
- Added TypeScript definitions.

## [1.1.0] - 2018-11-20
### Added:
- it is now possible to specify a prefix string for the database keys, so that multiple SDK clients can share the same DynamoDB table without interfering with each other's data as long as they use different prefixes.

## [1.0.0] - 2018-11-15

Initial release.
