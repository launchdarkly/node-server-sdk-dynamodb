# Contributing to this library

The source code for this library is [here](https://github.com/launchdarkly/node-server-sdk-dynamodb). We encourage pull-requests and other contributions from the community. Since this library is meant to be used in conjunction with the LaunchDarkly Server-Side Node.js SDK, you may want to look at the [SDK source code](https://github.com/launchdarkly/dotnet-server-sdk) and our [SDK contributor's guide](http://docs.launchdarkly.com/docs/sdk-contributors-guide).

## Submitting bug reports and feature requests
 
The LaunchDarkly SDK team monitors the [issue tracker](https://github.com/launchdarkly/node-server-sdk-dynamodb/issues) in this repository. Bug reports and feature requests specific to this project should be filed in the issue tracker. The SDK team will respond to all newly filed issues within two business days.
 
## Submitting pull requests
 
We encourage pull requests and other contributions from the community. Before submitting pull requests, ensure that all temporary or unintended code is removed. Don't worry about adding reviewers to the pull request; the LaunchDarkly SDK team will add themselves. The SDK team will acknowledge all pull requests within two business days.
 
## Build instructions
 
### Prerequisites

The project uses `npm`, which is bundled in all supported versions of Node. It should be built against the lowest compatible version, Node 12.

### Setup

To install project dependencies, from the project root directory:

```
npm install
```

### Testing

To run all unit tests:

```
npm test
```

The tests expect you to have DynamoDB running locally on the default port, 6379. One way to do this is with Docker:

```bash
docker run -p 8000:8000 amazon/dynamodb-local
```

To verify that the TypeScript declarations compile correctly (this involves compiling the file `test-types.ts`, so if you have changed any types or interfaces, you will want to update that code):

```
npm run check-typescript
```
