#!/usr/bin/env python3
"""Authenticated fictional Driver UI smoke on the local Android emulator."""
import pathlib
import re
import runpy
import subprocess
import sys
import tomllib

root = pathlib.Path(__file__).resolve().parents[2]
tools = runpy.run_path(str(root / 'mobile/scripts/qa-authenticated-e2e.py'))
run, tap, wait_for = (tools[name] for name in ('run', 'tap', 'wait_for'))
phone = '16505550102'
package = 'com.brightwhitemobile'


def main():
    config = tomllib.loads((root / 'backend/supabase/config.toml').read_text())
    code = config['auth']['sms']['test_otp'].get(phone)
    if not code or not str(code).isdigit():
        raise RuntimeError('Fictional local Driver OTP unavailable')
    devices = run('devices')
    if not any(line.startswith('emulator-') and '\tdevice' in line for line in devices.splitlines()):
        raise RuntimeError('No booted Android emulator')
    apk = root / 'mobile/android/app/build/outputs/apk/debug/app-debug.apk'
    if not apk.is_file():
        raise RuntimeError('Debug APK unavailable')
    run('install', '-r', str(apk))
    run('shell', 'pm', 'clear', package)
    run('shell', 'logcat', '-c')
    run('shell', 'am', 'start', '-n', f'{package}/.MainActivity')
    tap('Get Started', exact=True)
    tools['enter']('Mobile Number', phone)
    tap('Send OTP', exact=True)
    wait_for('Enter OTP', exact=True)
    tools['enter']('OTP', str(code))
    tap('Verify OTP', exact=True)
    wait_for('Driver dashboard', exact=True)
    print('PASS: fictional Driver authenticated through local OTP', flush=True)

    run('shell', 'am', 'force-stop', package)
    run('shell', 'am', 'start', '-n', f'{package}/.MainActivity')
    wait_for('Driver dashboard', exact=True)
    print('PASS: Driver session restored after app restart', flush=True)

    tap('Notifications', exact=True)
    wait_for('Driver notifications', exact=True)
    wait_for('Assigned pickup', exact=True)
    tap('View assigned job →', exact=True)
    wait_for('Job details', exact=True)
    wait_for('Accept job', exact=True)
    print('PASS: local Driver notification opened the owned assigned pickup after session restore', flush=True)
    tap('Accept job', exact=True)
    wait_for('Start trip', exact=True)
    run('shell', 'input', 'keyevent', 'KEYCODE_BACK')
    wait_for('Driver notifications', exact=True)
    run('shell', 'input', 'keyevent', 'KEYCODE_BACK')
    wait_for('Driver dashboard', exact=True)
    print('PASS: assigned pickup accepted once and Android hardware Back returned through notifications to dashboard', flush=True)

    tap('My profile', exact=True)
    wait_for('Driver profile', exact=True)
    run('shell', 'input', 'keyevent', 'KEYCODE_BACK')
    wait_for('Driver dashboard', exact=True)
    print('PASS: Driver profile and hardware Back navigation', flush=True)

    pid = run('shell', 'pidof', package).strip()
    if not pid:
        raise RuntimeError('Driver app process stopped unexpectedly')
    logs = run('logcat', '-d', f'--pid={pid}')
    if re.search(r'FATAL EXCEPTION|ReactNativeJS.*(?:TypeError|ReferenceError|Invariant Violation)', logs, re.I):
        raise RuntimeError('Fatal app error found in Android logcat')
    print('PASS: no fatal Driver app error observed during Android journey', flush=True)
    tap('Log out', exact=True)
    wait_for('Get Started', exact=True)
    print('PASS: Driver logout returned to unauthenticated screen', flush=True)


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError) as error:
        print(f'FAIL: Android Driver UI acceptance — {error}', file=sys.stderr)
        sys.exit(1)
