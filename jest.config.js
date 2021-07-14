module.exports = {
  preset: 'ts-jest',
  roots: [
    '<rootDir>/test'
  ],
  testMatch: [
    '**/test/*-test.ts'
  ],
  testEnvironment: 'node',
  testResultsProcessor: "jest-junit",
};