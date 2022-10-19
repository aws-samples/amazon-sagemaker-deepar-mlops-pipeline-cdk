// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { Construct } from 'constructs';
import {
    aws_s3 as s3, 
    aws_ec2 as ec2, 
    aws_stepfunctions as sfn, 
    aws_stepfunctions_tasks as tasks,
    Duration, 
    Size, 
} from 'aws-cdk-lib';

export interface CreateTrainingJobConstructProps {
    taskName: string,
    resultPath: string,
    deeparImageUri: string, 
    resourceBucket: s3.Bucket,
    hyperparameters: {
        [key:string]: any;
    },
    instanceType: string,
}

export class CreateTrainingJobConstruct extends Construct {
    public readonly task: tasks.SageMakerCreateTrainingJob;

    constructor(scope: Construct, id: string, props: CreateTrainingJobConstructProps) {
        super(scope, id);

        this.task = new tasks.SageMakerCreateTrainingJob(this, props.taskName, {
            integrationPattern: sfn.IntegrationPattern.RUN_JOB,
            resultPath: sfn.JsonPath.stringAt(props.resultPath),
            trainingJobName: sfn.JsonPath.stringAt('$.sagemakerResourceName'),
            algorithmSpecification: {
                trainingImage: tasks.DockerImage.fromRegistry(props.deeparImageUri),
                trainingInputMode: tasks.InputMode.FILE,
            },
            hyperparameters: props.hyperparameters,
            inputDataConfig: [
                {
                    channelName: 'train',
                    dataSource: {
                        s3DataSource: {
                            s3DataType: tasks.S3DataType.S3_PREFIX,
                            s3Location: tasks.S3Location.fromBucket(props.resourceBucket, 'json/train'),
                        },
                    },
                },
                {
                    channelName: 'test',
                    dataSource: {
                        s3DataSource: {
                            s3DataType: tasks.S3DataType.S3_PREFIX,
                            s3Location: tasks.S3Location.fromBucket(props.resourceBucket, 'json/test'),
                        },
                  },
                }
            ],
            outputDataConfig: {
                s3OutputLocation: tasks.S3Location.fromBucket(props.resourceBucket, 'model'),
            },
            resourceConfig: {
                instanceCount: 1,
                instanceType: new ec2.InstanceType(props.instanceType),
                volumeSize: Size.gibibytes(100),
            },
            stoppingCondition: {
                maxRuntime: Duration.hours(3),
            },
        });

    }
}