// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { Construct } from 'constructs';
import { aws_s3, Duration } from 'aws-cdk-lib';
import {
    aws_ec2 as ec2, 
    aws_iam as iam, 
    aws_logs as logs, 
    aws_s3 as s3,
    aws_stepfunctions as sfn, 
    aws_stepfunctions_tasks as tasks 
} from 'aws-cdk-lib';

import { GlueConstruct } from './glue';
import { LambdaConstruct } from './lambda';
import { TriggerConstruct } from './trigger';
import { CreateTrainingJobConstruct } from './create-training-job';
import { CreateModelConstruct } from './create-model';
import { CreateTransformJobConstruct } from './create-transform-job';

export interface StateMachineProps {
    resourceBucket: s3.Bucket;
}

export class StateMachine extends Construct {
    constructor(scope: Construct, id: string, props: StateMachineProps) {
        super(scope, id);

        // preprocessing
        const preprocess = new GlueConstruct(this, 'MLOpsPipelinePreprocess', {
            taskName: 'DeepAR-MLOps-Preprocess',
            pythonFilePath: 'glue/preprocess.py',
            resultPath: '$.preprocess',
            arguments: {
                '--bucket': props.resourceBucket.bucketName,
                '--fileuri': sfn.JsonPath.stringAt('$.fileuri'),
            },
        });

        // find deepar image uri from the below link and replace it
        // corresponding to the region where you want to run this pipeline
        // https://docs.aws.amazon.com/sagemaker/latest/dg/sagemaker-algo-docker-registry-paths.html
        const deeparImageUri = '204372634319.dkr.ecr.ap-northeast-2.amazonaws.com/forecasting-deepar:1'

        // create training job
        const createTrainingJob = new CreateTrainingJobConstruct(
            this, 'MLOpsPipelineCreateTrainingJob', 
            {
                taskName: 'DeepAR-MLOps-Train',
                resultPath: '$.train',
                deeparImageUri: deeparImageUri,
                instanceType: 'c4.2xlarge',
                resourceBucket: props.resourceBucket,
                hyperparameters: {
                    'time_freq': '2H',
                    'epochs': '400',
                    'early_stopping_patience': '40',
                    'mini_batch_size': '64',
                    'learning_rate': '5E-4',
                    'context_length': '84',
                    'prediction_length': '84',
                }
            }
        );

        // create model
        const createModel = new CreateModelConstruct(
            this, 'MLOpsPipelineCreateModel', 
            {
                taskName: 'DeepAR-MLOps-Create-Model',
                resultPath: '$.model',
                deeparImageUri: deeparImageUri,
                resourceBucket: props.resourceBucket,
            }
        );

        // create batch transform job
        const createTransformJob = new CreateTransformJobConstruct(
            this, 'MLOpsPipelineCreateTransformJob', 
            {
                taskName: 'DeepAR-MLOps-Transform',
                resultPath: '$.transform',
                instanceType: 'c4.2xlarge',
                resourceBucket: props.resourceBucket,
            }
        );

        // postprocessing
        const postprocess = new GlueConstruct(this, 'MLOpsPipelinePostprocess', {
            taskName: 'DeepAR-MLOps-Postprocess',
            pythonFilePath: 'glue/postprocess.py',
            resultPath: '$.postprocess',
            arguments: {
                '--forecastdir': sfn.JsonPath.stringAt('$.transform.TransformOutput.S3OutputPath'),
            },
        });

        /****** StateMachine - Begin ******/
        // IAM Role for StateMachine
        const statesMachineExecutionRole = new iam.Role(
            this, 'DeepARMLOpsPipelineStateMachineExecutionRole', {
                assumedBy: new iam.ServicePrincipal('states.amazonaws.com'),
                roleName: 'DeepARMLOpsPipelineStateMachineExecutionRole',
                managedPolicies: [
                    iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSGlueServiceRole'),
                    iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaRole'),
                    iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSageMakerFullAccess'),
                ],
            }
        );

        // StateMachine Definition
        const definition = preprocess.task
                        .next(createTrainingJob.task)
                        .next(createModel.task)
                        .next(createTransformJob.task)
                        .next(postprocess.task);
                
        const stateMachine = new sfn.StateMachine(
            this, 'DeepARMLOpsPipelineStateMachine', {
                role: statesMachineExecutionRole,
                definition: definition,
                stateMachineName: 'DeepAR-MLOps-Pipeline',
            }
        );
        /****** StateMachine - End ******/

        // Configure S3 Upload Trigger for StateMachine
        const uploadTrigger = new TriggerConstruct(
            this, 
            'UploadTrigger', {
                resourceBucket: props.resourceBucket,
                stateMachine: stateMachine,
                s3Prefix: 'raw/',
                s3Suffix: '.zip',
            }
        );

    }

}
