# Change log

All notable changes to the LaunchDarkly Node.js SDK DynamoDB integration will be documented in this file. This project adheres to [Semantic Versioning](http://semver.org).

## [1.0.0] - 2018-11-15

Initial release.

## [1.1.0] - 2018-11-20
### Added:
- it is now possible to specify a prefix string for the database keys, so that multiple SDK clients can share the same DynamoDB table without interfering with each other's data as long as they use different prefixes.
