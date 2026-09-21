#!/usr/bin/env python3
"""Require current physical iPhone Driver QA evidence for final checkpoint."""
import json
import pathlib
import subprocess
import sys
from datetime import datetime, timezone

root = pathlib.Path(__file__).resolve().parents[2]
record_path = root / 'reports/milestones/7H-IOS-DEVICE-ACCEPTANCE.json'
required = (
    'driver_local_otp_login', 'session_restore', 'assignment_navigation',
    'background_gps', 'notification_deep_link', 'location_denied',
    'offline_retry', 'fatal_log_sweep',
)
try:
    record = json.loads(record_path.read_text())
    device_id = record['device_udid']
    if not isinstance(device_id, str) or not device_id:
        raise ValueError('physical iPhone identifier is missing')
    subprocess.run(['xcrun', 'devicectl', 'device', 'info', 'details',
                    '--device', device_id], check=True, capture_output=True,
                   text=True, timeout=30)
    tested_at = datetime.fromisoformat(record['tested_at'].replace('Z', '+00:00'))
    if tested_at.tzinfo is None or (datetime.now(timezone.utc) - tested_at).total_seconds() > 86400:
        raise ValueError('physical Driver evidence is older than 24 hours')
    if any(record.get(key) is not True for key in required):
        raise ValueError('one or more authenticated physical Driver checks remain unverified')
except (OSError, ValueError, KeyError, json.JSONDecodeError, subprocess.SubprocessError) as error:
    print(f'FAIL: physical iPhone Driver QA pending: {error}')
    sys.exit(1)
print('PASS: authenticated physical iPhone Driver QA recorded and device online')
