# Change log

All notable changes to the LaunchDarkly Node.js SDK DynamoDB integration will be documented in this file. This project adheres to [Semantic Versioning](http://semver.org).

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
