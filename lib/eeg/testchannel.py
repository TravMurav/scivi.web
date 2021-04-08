#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import math


THRESHOLD = 10000

isHigh = False
if "EEG" in INPUT:
    chName = SETTINGS_VAL["Channel Name"]
    eeg = INPUT["EEG"]
    if chName in eeg[0]:
        val = eeg[1][eeg[0].index(chName)]
        isHigh = math.abs(val[0]) > THRESHOLD or math.abs(val[-1]) > THRESHOLD

OUTPUT["Is High"] = isHigh
