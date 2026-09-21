#!/usr/bin/env python3
"""Require recorded physical background-GPS acceptance before 7D checkpoint."""
import json
import pathlib
import sys

root = pathlib.Path(__file__).resolve().parents[2]
evidence = root / 'reports/milestones/7D-DEVICE-ACCEPTANCE.json'
required = (
    'android_background_updates_after_native_navigation',
    'ios_background_updates_after_native_navigation',
    'android_stops_after_trip',
    'ios_stops_after_trip',
    'customer_tracking_matches_assigned_driver',
)
try:
    record = json.loads(evidence.read_text())
    if not all(record.get(key) is True for key in required):
        raise ValueError('one or more physical acceptance checks remain unverified')
    if not record.get('tested_at'):
        raise ValueError('device acceptance date is missing')
except (OSError, ValueError, json.JSONDecodeError) as error:
    print(f'FAIL: physical Android/iOS background GPS acceptance pending: {error}')
    sys.exit(1)
print('PASS: physical Android/iOS background GPS acceptance recorded')
