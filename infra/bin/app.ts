#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CedarTerraceStack } from '../lib/cedar-terrace-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

new CedarTerraceStack(app, 'CedarTerrace-Dev', {
  env,
  stackName: 'cedar-terrace-dev',
  description: 'Cedar Terrace Parking Enforcement System - Development',
  tags: {
    Environment: 'dev',
    Project: 'cedar-terrace',
  },
});
