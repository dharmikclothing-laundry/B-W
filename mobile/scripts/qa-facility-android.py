#!/usr/bin/env python3
"""Authenticated local Facility Staff smoke on a booted Android emulator."""
import pathlib
import re
import runpy
import subprocess
import sys
import tomllib

root = pathlib.Path(__file__).resolve().parents[2]
ui = runpy.run_path(str(root / 'mobile/scripts/qa-authenticated-e2e.py'))
run, tap, wait_for, enter = (ui[key] for key in ('run', 'tap', 'wait_for', 'enter'))
phone = '16505550103'
package = 'com.brightwhitemobile'


def main():
    config = tomllib.loads((root / 'backend/supabase/config.toml').read_text())
    otp = config['auth']['sms']['test_otp'].get(phone)
    if not otp or not str(otp).isdigit():
        raise RuntimeError('Fictional local Facility OTP unavailable')
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
    wait_for('Facility dashboard', exact=True)
    wait_for('Receive Driver handoff', exact=True)
    print('PASS: fictional Facility Staff authenticated through local OTP and saw scoped dashboard', flush=True)

    run('shell', 'am', 'force-stop', package)
    run('shell', 'am', 'start', '-n', f'{package}/.MainActivity')
    wait_for('Facility dashboard', exact=True)
    print('PASS: Facility session restored after app restart', flush=True)
    tap('Receive Driver handoff', exact=True)
    wait_for('Facility intake', exact=True)
    tap('Find order', exact=True)
    wait_for('Enter the complete BW1 handoff code or QR value.')
    print('PASS: intake rejects an empty or malformed handoff code', flush=True)
    run('shell', 'input', 'keyevent', 'KEYCODE_BACK')
    wait_for('Facility dashboard', exact=True)
    tap('Refresh dashboard', exact=True)
    wait_for('Facility dashboard', exact=True)
    print('PASS: Android hardware Back and dashboard refresh', flush=True)

    pid = run('shell', 'pidof', package).strip()
    if not pid:
        raise RuntimeError('Facility app process stopped unexpectedly')
    logs = run('logcat', '-d', f'--pid={pid}')
    if re.search(r'FATAL EXCEPTION|ReactNativeJS.*(?:TypeError|ReferenceError|Invariant Violation)', logs, re.I):
        raise RuntimeError('Fatal app error found in Android logcat')
    print('PASS: no fatal Facility app error during Android journey', flush=True)
    tap('Log out', exact=True)
    wait_for('Get Started', exact=True)
    print('PASS: Facility logout returned to unauthenticated screen', flush=True)


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError) as error:
        print(f'FAIL: Android Facility UI acceptance — {error}', file=sys.stderr)
        sys.exit(1)
