// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
    aws_s3 as s3, 
    aws_iam as iam, 
} from 'aws-cdk-lib';
import { StateMachine } from './construct/state-machine';

export class DeeparMlopsPipelineCdkStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // S3 Bucket for pipeline resources
        const resourceBucket = new s3.Bucket(this, `DeepARMLOpsPipelineResourceBucket`, {
            bucketName: `deepar-mlops-pipeline-resource-${cdk.Stack.of(this).account}`,
            versioned: false,
            // autoDeleteObjects: true,
            removalPolicy: cdk.RemovalPolicy.DESTROY
        });

        // instantiate StateMachine construct
        const stateMachine = new StateMachine(
            this, 'MLOpsPiplineStateMachine', 
            {
                resourceBucket: resourceBucket,
                region: props?.env?.region!
            }
        );
    }
}
