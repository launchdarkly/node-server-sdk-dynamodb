#!/bin/bash

set -e

npm install
npm run lint
npm run check-typescript

# Running the unit tests would require installing DynamoDB, which is slow. They've already been run in CI.
