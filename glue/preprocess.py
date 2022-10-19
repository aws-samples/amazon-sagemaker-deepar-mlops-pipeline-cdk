# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

#!/usr/bin/env python
# coding: utf-8

import zipfile
import boto3
import pandas as pd
import numpy as np
import sys
import os
import json
import datetime

from awsglue.utils import getResolvedOptions


s3 = boto3.client('s3')


def download_and_extract(bucket, fileuri, data_dir):
    dst_path = os.path.join('/tmp', fileuri)
    os.makedirs(os.path.dirname(dst_path), exist_ok=True)

    s3.download_file(bucket, fileuri, dst_path)

    with zipfile.ZipFile(dst_path, 'r') as zipf:
        zipf.extractall(data_dir)


def write_dicts_to_file(path, data):
    with open(path, "wb") as fp:
        for d in data:
            fp.write(json.dumps(d).encode("utf-8"))
            fp.write("\n".encode("utf-8"))


# you can implement your own preprocessing logic here for your own dataset
def preprocess(data_dir):
    # load txt
    txt_path = os.path.join(data_dir, 'LD2011_2014.txt')
    data = pd.read_csv(txt_path, sep=";", index_col=0, parse_dates=True, decimal=",")

    # resampling
    num_timeseries = data.shape[1]
    data_kw = data.resample("2H").sum() / 8
    timeseries = []
    for i in range(num_timeseries):
        timeseries.append(np.trim_zeros(data_kw.iloc[:, i], trim="f"))

    # train/test splits
    freq = "2H"
    prediction_length = 7 * 12

    start_dataset = pd.Timestamp("2014-01-01 00:00:00", freq=freq)
    end_training = pd.Timestamp("2014-09-01 00:00:00", freq=freq)

    # training dataset
    training_data = [
        {
            "start": str(start_dataset),
            "target": ts[
                start_dataset : end_training - datetime.timedelta(days=1)
            ].tolist(),  # We use -1, because pandas indexing includes the upper bound
        }
        for ts in timeseries
    ]

    # test dataset
    num_test_windows = 4
    test_data = [
        {
            "start": str(start_dataset),
            "target": ts[start_dataset : end_training + datetime.timedelta(days=k * prediction_length)].tolist(),
        }
        for k in range(1, num_test_windows + 1)
        for ts in timeseries
    ]

    write_dicts_to_file(os.path.join(data_dir, "train.json"), training_data)
    write_dicts_to_file(os.path.join(data_dir, "test.json"), test_data)


def save_to_s3(bucket, data_dir):
    file_list = os.listdir(data_dir)

    for single_file in file_list:
        if single_file.endswith('.json'):
            kind = os.path.splitext(os.path.basename(single_file))[0]
            object_key = os.path.join(f'json/{kind}', f'{kind}.json')
            s3.upload_file(os.path.join(data_dir, single_file), bucket, object_key)


# main
args = getResolvedOptions(sys.argv, ['bucket', 'fileuri'])
bucket = args['bucket']
fileuri = args['fileuri']

data_dir = 'input/'
download_and_extract(bucket, fileuri, data_dir)
preprocess(data_dir)
save_to_s3(bucket, data_dir)
