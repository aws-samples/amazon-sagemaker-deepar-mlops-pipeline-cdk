#!/usr/bin/env node

// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DeeparMlopsPipelineCdkStack } from '../lib/deepar-mlops-pipeline-cdk-stack';

const app = new cdk.App();
const region =
    app.node.tryGetContext("region") ||
    process.env.CDK_DEPLOY_REGION ||
    process.env.CDK_DEFAULT_REGION;
const deeparMlopsPipelineCdkStack = new DeeparMlopsPipelineCdkStack(
    app, 'DeeparMlopsPipelineCdkStack', {
        env: { region: region },
    }
);