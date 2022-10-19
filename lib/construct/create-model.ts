// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { Construct } from 'constructs';
import {
    aws_iam as iam,
    aws_s3 as s3, 
    aws_stepfunctions as sfn, 
    aws_stepfunctions_tasks as tasks,
} from 'aws-cdk-lib';

export interface CreateModelConstructProps {
    taskName: string,
    resultPath: string,
    resourceBucket: s3.Bucket,
    deeparImageUri: string, 
}

export class CreateModelConstruct extends Construct {
    public readonly task: tasks.SageMakerCreateModel;

    constructor(scope: Construct, id: string, props: CreateModelConstructProps) {
        super(scope, id);

        const createModelRole = new iam.Role(this, `${props.taskName}Role`, {
			assumedBy: new iam.ServicePrincipal('sagemaker.amazonaws.com'),
			roleName: `${props.taskName}-Role`,
			managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSageMakerFullAccess'),
                iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
			],
		});

        this.task = new tasks.SageMakerCreateModel(this, props.taskName, {
            role: createModelRole,
            modelName: sfn.JsonPath.stringAt('$.sagemakerResourceName'),
            resultPath:  sfn.JsonPath.stringAt(props.resultPath),
            primaryContainer: new tasks.ContainerDefinition({
                image: tasks.DockerImage.fromRegistry(props.deeparImageUri),
                mode: tasks.Mode.SINGLE_MODEL,
                modelS3Location: tasks.S3Location.fromJsonExpression('$.train.ModelArtifacts.S3ModelArtifacts'),
            }),
            
        });

    }
}