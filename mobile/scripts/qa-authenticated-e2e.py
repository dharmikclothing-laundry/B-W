#!/usr/bin/env python3
"""Run the local mock customer journey on an Android emulator through accessibility UI."""
import os
import pathlib
import re
import subprocess
import sys
import time
import tomllib
import xml.etree.ElementTree as ET

root = pathlib.Path(__file__).resolve().parents[2]
mobile = root / 'mobile'
backend = root / 'backend'
sdk = pathlib.Path(os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT') or pathlib.Path.home() / 'Library/Android/sdk')
adb = str(sdk / 'platform-tools/adb')
package = 'com.brightwhitemobile'
phone = '16505550101'  # Reserved fictional number in local Supabase config.


def run(*args, capture=True):
    result = subprocess.run([adb, *args], check=True, capture_output=capture, text=True)
    return result.stdout if capture else ''


def bounds(node):
    match = re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', node.get('bounds', ''))
    if not match:
        raise RuntimeError('UI control has no screen bounds')
    left, top, right, bottom = map(int, match.groups())
    return (left + right) // 2, (top + bottom) // 2


def tree():
    for _ in range(5):
        try:
            result = run('shell', 'uiautomator', 'dump', '/sdcard/bw-6u3.xml')
            if 'dumped to:' in result:
                return ET.fromstring(run('shell', 'cat', '/sdcard/bw-6u3.xml'))
        except (subprocess.CalledProcessError, ET.ParseError):
            pass
        time.sleep(1)
    raise RuntimeError('Android accessibility hierarchy is unavailable')


def find(root_node, label, *, exact=False, cls=None):
    for node in root_node.iter('node'):
        if cls and node.get('class') != cls:
            continue
        labels = [node.get(field, '') for field in ('text', 'content-desc', 'hint')]
        if any(value == label if exact else label in value for value in labels):
            return node
    return None


def wait_for(label, *, exact=False, scroll=False, cls=None, tries=12):
    for attempt in range(tries):
        current = tree()
        node = find(current, label, exact=exact, cls=cls)
        if node is not None:
            return node, current
        if scroll and attempt % 2 == 1:
            run('shell', 'input', 'swipe', '160', '530', '160', '175', '550')
        else:
            time.sleep(1)
    raise RuntimeError(f'Expected UI control was not visible: {label}')


def tap(label, *, exact=False, scroll=False, cls=None):
    node, _ = wait_for(label, exact=exact, scroll=scroll, cls=cls)
    x, y = bounds(node)
    run('shell', 'input', 'tap', str(x), str(y))
    return node


def enter(hint, value):
    tap(hint, cls='android.widget.EditText')
    run('shell', 'input', 'text', value)


def checkpoint(label):
    print(f'PASS: {label}', flush=True)


def dismiss_debug_banner():
    banner = find(tree(), 'Open debugger to view warnings.')
    if banner is not None:
        right = int(re.findall(r'\d+', banner.get('bounds', ''))[2])
        _, y = bounds(banner)
        run('shell', 'input', 'tap', str(right - 22), str(y))


def main():
    config = tomllib.loads((backend / 'supabase/config.toml').read_text())
    token = config['auth']['sms']['test_otp'].get(phone)
    if not token or not str(token).isdigit():
        raise RuntimeError('Reserved local mock OTP is unavailable')
    devices = run('devices')
    if not any(line.startswith('emulator-') and '\tdevice' in line for line in devices.splitlines()):
        raise RuntimeError('No booted Android emulator')
    apk = mobile / 'android/app/build/outputs/apk/debug/app-debug.apk'
    if not apk.is_file():
        raise RuntimeError('Debug APK is missing')

    run('install', '-r', str(apk))
    run('shell', 'pm', 'clear', package)
    run('shell', 'logcat', '-c')
    run('shell', 'am', 'start', '-n', f'{package}/.MainActivity')
    tap('Get Started', exact=True)
    enter('Mobile Number', phone)
    tap('Send OTP', exact=True)
    wait_for('Enter OTP', exact=True)
    enter('OTP', str(token))
    tap('Verify OTP', exact=True)
    wait_for('What do you need?', exact=True)
    checkpoint('local OTP authentication')

    run('shell', 'am', 'force-stop', package)
    run('shell', 'am', 'start', '-n', f'{package}/.MainActivity')
    wait_for('What do you need?', exact=True)
    checkpoint('session restore after restart')

    dismiss_debug_banner()
    tap('View →', exact=True, scroll=True)
    wait_for('Wash & Fold', exact=True)
    checkpoint('service browsing')
    tap('+', exact=True)
    tap('Cart', exact=True)
    wait_for('Your Cart', exact=True)
    wait_for('1 item')
    checkpoint('add item to cart')
    dismiss_debug_banner()
    tap('Continue', scroll=True)
    wait_for('Pickup Address', exact=True)
    address, _ = wait_for('Development Test Address', scroll=True)
    _, address_y = bounds(address)
    run('shell', 'input', 'tap', '48', str(max(175, address_y - 30)))
    tap('Continue to Pickup Slot', scroll=True)
    checkpoint('saved address')

    wait_for('Pickup Date & Time')
    tap('Tomorrow', exact=True)
    tap('Available', exact=True, scroll=True)
    tap('Continue to Order Review', scroll=True)
    wait_for('Order Review', exact=True)
    checkpoint('future pickup slot and order review')
    tap('Continue to Payment', scroll=True)
    wait_for('Payment', exact=True)
    tap('Online Payment', exact=True, scroll=True)
    run('shell', 'input', 'swipe', '160', '520', '160', '170', '550')
    consent, _ = wait_for('Customer Consent', exact=True)
    _, consent_y = bounds(consent)
    pay_button, _ = wait_for('Pay ₹', scroll=True)
    if pay_button.get('enabled') == 'true':
        raise RuntimeError('Checkout proceeded without required terms consent')
    x, y = bounds(pay_button)
    run('shell', 'input', 'tap', str(x), str(y))
    wait_for('Customer Consent', exact=True)
    checkpoint('invalid checkout state rejected')
    run('shell', 'input', 'tap', '31', str(consent_y + 32))
    tap('Pay ₹', scroll=True)
    wait_for('Order Confirmed', exact=True, tries=20)
    checkpoint('mock online payment and order success')

    tap('View Your Orders', exact=True, scroll=True)
    wait_for('Your Orders', exact=True)
    tap('View Details', scroll=True)
    wait_for('Order Details', exact=True)
    run('shell', 'input', 'keyevent', 'KEYCODE_BACK')
    wait_for('Your Orders', exact=True)
    checkpoint('history, details, and hardware Back')

    pid = run('shell', 'pidof', package).strip()
    if not pid:
        raise RuntimeError('App process is no longer running')
    logs = run('logcat', '-d', f'--pid={pid}')
    if re.search(r'FATAL EXCEPTION|ReactNativeJS.*(?:TypeError|ReferenceError|Invariant Violation)', logs, re.I):
        raise RuntimeError('Fatal app error found after the journey')
    checkpoint('fatal log and crash sweep')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError, ET.ParseError) as error:
        print(f'FAIL: Android authenticated journey — {error}', file=sys.stderr)
        sys.exit(1)
