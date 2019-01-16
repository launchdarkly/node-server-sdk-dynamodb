# Change log

All notable changes to the LaunchDarkly Node.js SDK DynamoDB integration will be documented in this file. This project adheres to [Semantic Versioning](http://semver.org).

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
