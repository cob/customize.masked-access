#!/bin/bash

set -e

mvn clean package
cp target/cob-customize-validator-*.jar ../../../recordm/bundles/
