#!/usr/bin/env python3
"""Validate fresh, authenticated physical iPhone Facility QA evidence."""
import json
import pathlib
import subprocess
import sys
from datetime import datetime, timezone

root = pathlib.Path(__file__).resolve().parents[2]
record_path = root / 'reports/milestones/8G-IOS-DEVICE-ACCEPTANCE.json'
required = (
    'facility_local_otp_login', 'session_restore', 'dashboard_queue',
    'intake_navigation', 'invalid_code_rejected', 'logout',
    'offline_retry', 'fatal_log_sweep',
)
try:
    record = json.loads(record_path.read_text())
    device_id = record['device_udid']
    if not isinstance(device_id, str) or not device_id:
        raise ValueError('physical iPhone identifier missing')
    subprocess.run(['xcrun', 'devicectl', 'device', 'info', 'details', '--device', device_id],
                   check=True, capture_output=True, text=True, timeout=30)
    tested_at = datetime.fromisoformat(record['tested_at'].replace('Z', '+00:00'))
    if tested_at.tzinfo is None or not 0 <= (datetime.now(timezone.utc) - tested_at).total_seconds() <= 86400:
        raise ValueError('Facility device evidence is absent or older than 24 hours')
    if any(record.get(key) is not True for key in required):
        raise ValueError('authenticated Facility iPhone checks remain unverified')
    screenshots = record['screenshots']
    for stage in ('dashboard', 'session_restore', 'logout'):
        screenshot = pathlib.Path(screenshots[stage])
        if not screenshot.is_file():
            raise ValueError(f'{stage} iPhone screenshot evidence is missing')
    if record.get('bw_crash_log_entries') != 0 or record.get('app_process_running') is not True:
        raise ValueError('iPhone crash/process sweep did not pass')
except (OSError, ValueError, KeyError, json.JSONDecodeError, subprocess.SubprocessError) as error:
    print(f'FAIL: physical iPhone Facility QA pending: {error}')
    sys.exit(1)
print('PASS: authenticated physical iPhone Facility QA recorded and device online')
