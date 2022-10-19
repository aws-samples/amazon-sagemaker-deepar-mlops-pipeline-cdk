// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { Construct } from 'constructs';
import {
    aws_iam as iam,
    aws_s3 as s3, 
    aws_ec2 as ec2, 
    aws_stepfunctions as sfn, 
    aws_stepfunctions_tasks as tasks,
    Duration, 
    Size, 
} from 'aws-cdk-lib';

export interface CreateTransformJobConstructProps {
    taskName: string,
    resultPath: string,
    resourceBucket: s3.Bucket,
    instanceType: string,
}

export class CreateTransformJobConstruct extends Construct {
    public readonly task: tasks.SageMakerCreateTransformJob;

    constructor(scope: Construct, id: string, props: CreateTransformJobConstructProps) {
        super(scope, id);

        this.task = new tasks.SageMakerCreateTransformJob(this, props.taskName, {
            integrationPattern: sfn.IntegrationPattern.RUN_JOB,
            resultPath: sfn.JsonPath.stringAt(props.resultPath),
            transformJobName: sfn.JsonPath.stringAt('$.sagemakerResourceName'),
            modelName: sfn.JsonPath.stringAt('$.sagemakerResourceName'),
            modelClientOptions: {
                invocationsMaxRetries: 3,
                invocationsTimeout: Duration.minutes(5),
            },
            batchStrategy: tasks.BatchStrategy.SINGLE_RECORD,
            transformInput: {
                transformDataSource: {
                    s3DataSource: {
                        s3DataType: tasks.S3DataType.S3_PREFIX,
                        s3Uri: `s3://${props.resourceBucket.bucketName}/json/train`,
                    }
                },
                splitType: tasks.SplitType.LINE
            },
            transformOutput: {
                s3OutputPath: `s3://${props.resourceBucket.bucketName}/json/forecast`,
                assembleWith: tasks.AssembleWith.LINE,
            },
            transformResources: {
                instanceCount: 1,
                instanceType: new ec2.InstanceType(props.instanceType)
            }
        });

    }
}