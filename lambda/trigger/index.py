# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
import os
import boto3
from json import loads, dumps
from datetime import datetime, timedelta

sfn = boto3.client('stepfunctions')
s3 = boto3. client('s3')


def handler(event, context):
    ts = datetime.now() # note TZ is UTC
    ts = ts.strftime("%Y%m%dT%H%M%S")

    return dumps(
        sfn.start_execution(
            stateMachineArn=os.environ['STEP_FUNCTIONS_ARN'],
            name=ts,
            input=dumps(
                {
                    'uid': ts, 
                    'fileuri': event['Records'][0]['s3']['object']['key'],
                    'sagemakerResourceName': f'DeepAR-MLOps-Pipeline-{ts}',
                }
            )
        ),
        default=str
    )
