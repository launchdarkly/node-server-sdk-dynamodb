#!/bin/bash

PACKAGE_JSON_TEMP=./package.json.tmp
sed "s/\"version\".*/\"version\": \"${LD_RELEASE_VERSION}\",/g" package.json > ${PACKAGE_JSON_TEMP}
mv ${PACKAGE_JSON_TEMP} package.json
