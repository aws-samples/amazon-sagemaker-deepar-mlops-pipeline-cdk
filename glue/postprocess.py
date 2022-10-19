# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

#!/usr/bin/env python
# coding: utf-8
import boto3
import pandas as pd
import sys
import os
import json
from urllib.parse import urlparse
from awsglue.utils import getResolvedOptions

s3 = boto3.client('s3')


def download_json(bucket_name, forecast_dir, json_dir):
    s3_resource = boto3.resource('s3')
    bucket = s3_resource.Bucket(bucket_name) 
    for obj in bucket.objects.filter(Prefix=forecast_dir):
        dst_path = os.path.join(json_dir, obj.key.split('/')[-1])
        bucket.download_file(obj.key, dst_path)


# you can implement your own postprocessing logic here for your own dataset
# here we are converting forecast result json into a friendly csv as an example
def postprocess(jsonf, json_dir, csv_dir):
    forecast_start = "2014-09-01 00:00:00"
    forecast_end = "2014-09-07 22:00:00"

    ts_series = pd.Series([dt.strftime('%Y-%m-%d %H:%M:%S') for dt \
        in pd.date_range(forecast_start, forecast_end, freq='2H')])

    with open(os.path.join(json_dir, jsonf), "r", encoding="utf-8") as inputf:
        rows = inputf.readlines()

    idx = 1
    df = pd.DataFrame(columns=['Household', 'Timestamp', 'p10', 'p50', 'p90'])

    for row in rows:
        temp_df = pd.DataFrame(columns=['Household', 'Timestamp', 'p10', 'p50', 'p90'])
        predictions = json.loads(row)['quantiles']
        p10_series = pd.Series(predictions['0.1'])
        p50_series = pd.Series(predictions['0.5'])
        p90_series = pd.Series(predictions['0.9'])
        household_series = pd.Series([f'MT{str(idx).zfill(3)}' for _ in range(len(p10_series))])

        temp_df['Household'] = household_series
        temp_df['Timestamp'] = ts_series
        temp_df['p10'] = p10_series
        temp_df['p50'] = p50_series
        temp_df['p90'] = p90_series

        df = pd.concat([df, temp_df])
        idx += 1

        filename = os.path.splitext(os.path.basename(jsonf))[0]
        dst_path = os.path.join(csv_dir, f'{filename}.csv')
        df.to_csv(dst_path, index=False)


def save_to_s3(bucket_name, csv_dir):
    csv_list = os.listdir(csv_dir)

    for single_file in csv_list:
        object_key = f'forecast/{single_file}'
        s3.upload_file(os.path.join(csv_dir, single_file), bucket_name, object_key)


# main
args = getResolvedOptions(sys.argv, ['forecastdir'])
forecast_dir = args['forecastdir']

parsed = urlparse(forecast_dir)
bucket_name = parsed.netloc
forecast_dir = parsed.path.lstrip('/')

json_dir = '/tmp/json'
os.makedirs(json_dir, exist_ok=True)
download_json(bucket_name, forecast_dir, json_dir)

json_files = os.listdir(json_dir)

csv_dir = '/tmp/csv'
os.makedirs(csv_dir, exist_ok=True)
for jsonf in json_files:
    postprocess(jsonf, json_dir, csv_dir)

save_to_s3(bucket_name, csv_dir)
