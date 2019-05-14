
module.exports = {
  automock: false,
  resetModules: true,
  testMatch: ['**/tests/**/*-test.js'],
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  transformIgnorePatterns: [
    '<rootDir>/[^/]*\\.js',
    '<rootDir>/node_modules/(?!(launchdarkly-node-server-sdk/test)/)',
    // The line above is necessary because the Node SDK shared test code uses syntax that isn't Node 6 compatible,
    // so we want to make sure it gets transpiled, which Babel won't do for imported modules by default.
  ],
};
