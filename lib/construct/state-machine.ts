// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import {Construct} from 'constructs';
import {aws_s3, Duration} from 'aws-cdk-lib';
import {
    aws_ec2 as ec2,
    aws_iam as iam,
    aws_logs as logs,
    aws_s3 as s3,
    aws_stepfunctions as sfn,
    aws_stepfunctions_tasks as tasks
} from 'aws-cdk-lib';

import {GlueConstruct} from './glue';
import {LambdaConstruct} from './lambda';
import {TriggerConstruct} from './trigger';
import {CreateTrainingJobConstruct} from './create-training-job';
import {CreateModelConstruct} from './create-model';
import {CreateTransformJobConstruct} from './create-transform-job';

export interface StateMachineProps {
    region: string;
    resourceBucket: s3.Bucket;
}

export class StateMachine extends Construct {
    private readonly containerRegistryAccountRegionMap: Map<string, string> = new Map([
        // check here if you do not see your desired region code listed
        // https://docs.aws.amazon.com/sagemaker/latest/dg-ecr-paths/sagemaker-algo-docker-registry-paths.html
        ["af-south-1", "455444449433"],
        ["ap-east-1", "286214385809"],
        ["ap-northeast-1", "633353088612"],
        ["ap-northeast-2", "204372634319"],
        ["ap-northeast-3", "867004704886"],
        ["ap-south-1", "991648021394"],
        ["ap-south-2", "628508329040"],
        ["ap-southeast-1", "475088953585"],
        ["ap-southeast-2", "514117268639"],
        ["ap-southeast-3", "951798379941"],
        ["ap-southeast-4", "106583098589"],
        ["ca-central-1", "469771592824"],
        ["cn-north-1", "390948362332"],
        ["cn-northwest-1", "387376663083"],
        ["eu-central-1", "495149712605"],
        ["eu-central-2", "680994064768"],
        ["eu-north-1", "669576153137"],
        ["eu-south-1", "257386234256"],
        ["eu-south-2", "104374241257"],
        ["eu-west-1", "224300973850"],
        ["eu-west-2", "644912444149"],
        ["eu-west-3", "749696950732"],
        ["me-south-1", "249704162688"],
        ["me-central-1", "272398656194"],
        ["sa-east-1", "855470959533"],
        ["us-east-1", "522234722520"],
        ["us-east-2", "566113047672"],
        ["us-gov-west-1", "226302683700"],
        ["us-gov-east-1", "237065988967"],
        ["us-west-1", "632365934929"],
        ["us-west-2", "156387875391"],
    ]);

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
        const deeparImageUri = `${this.containerRegistryAccountRegionMap.get(props.region)}.dkr.ecr.${props.region}.amazonaws.com/forecasting-deepar:1`

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
