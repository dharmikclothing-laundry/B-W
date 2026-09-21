#!/usr/bin/env python3
"""Authenticated fictional Admin dashboard journey on the local Android emulator."""
import pathlib
import re
import runpy
import subprocess
import sys
import tomllib

root = pathlib.Path(__file__).resolve().parents[2]
ui = runpy.run_path(str(root / 'mobile/scripts/qa-authenticated-e2e.py'))
run, tap, wait_for, enter = (ui[name] for name in ('run', 'tap', 'wait_for', 'enter'))
phone = '16505550106'
package = 'com.brightwhitemobile'


def main():
    config = tomllib.loads((root / 'backend/supabase/config.toml').read_text())
    otp = config['auth']['sms']['test_otp'].get(phone)
    if not otp or not str(otp).isdigit():
        raise RuntimeError('Fictional local Admin OTP unavailable')
    if not any(line.startswith('emulator-') and '\tdevice' in line for line in run('devices').splitlines()):
        raise RuntimeError('No booted Android emulator')
    apk = root / 'mobile/android/app/build/outputs/apk/debug/app-debug.apk'
    if not apk.is_file():
        raise RuntimeError('Debug APK unavailable')
    run('install', '-r', str(apk))
    run('shell', 'pm', 'clear', package)
    run('shell', 'logcat', '-c')
    run('shell', 'am', 'start', '-n', f'{package}/.MainActivity')
    tap('Get Started', exact=True)
    enter('Mobile Number', phone)
    tap('Send OTP', exact=True)
    wait_for('Enter OTP', exact=True)
    enter('OTP', str(otp))
    tap('Verify OTP', exact=True)
    wait_for('Admin dashboard', exact=True)
    wait_for('Operations', exact=True)
    wait_for('People and facilities', exact=True)
    print('PASS: privileged fictional Admin OTP opens the analytics dashboard', flush=True)
    run('shell', 'am', 'force-stop', package)
    run('shell', 'am', 'start', '-n', f'{package}/.MainActivity')
    wait_for('Admin dashboard', exact=True)
    print('PASS: Admin secure session restored after restart', flush=True)
    tap('Refresh dashboard', exact=True)
    wait_for('Active orders')
    print('PASS: Admin dashboard refresh and operational summary', flush=True)
    pid = run('shell', 'pidof', package).strip()
    if not pid:
        raise RuntimeError('Admin app process stopped unexpectedly')
    logs = run('logcat', '-d', f'--pid={pid}')
    if re.search(r'FATAL EXCEPTION|ReactNativeJS.*(?:TypeError|ReferenceError|Invariant Violation)', logs, re.I):
        raise RuntimeError('Fatal Admin app error in logcat')
    print('PASS: no fatal Admin app error during Android journey', flush=True)
    tap('Log out', exact=True)
    wait_for('Get Started', exact=True)
    print('PASS: Admin logout cleared the authenticated route', flush=True)


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError) as error:
        print(f'FAIL: Android Admin UI acceptance — {error}', file=sys.stderr)
        sys.exit(1)
