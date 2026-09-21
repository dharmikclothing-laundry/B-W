#!/usr/bin/env python3
"""Validate and stage ignored Firebase app configs; never print their contents."""
import argparse
import json
import pathlib
import plistlib
import shutil
import sys

root = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('environment', choices=('development', 'uat', 'production'))
parser.add_argument('--stage', action='store_true')
args = parser.parse_args()

source = root / 'config' / 'firebase' / args.environment
android = source / 'google-services.json'
ios = source / 'GoogleService-Info.plist'
if not android.is_file() or not ios.is_file():
    sys.exit(f'FAIL: {args.environment} Firebase app configs are missing')
try:
    android_data = json.loads(android.read_text())
    ios_data = plistlib.loads(ios.read_bytes())
    project = android_data['project_info']['project_id']
    packages = [client['client_info']['android_client_info']['package_name']
                for client in android_data['client']]
    ios_bundle = ios_data['BUNDLE_ID']
    ios_project = ios_data['PROJECT_ID']
except (KeyError, ValueError, TypeError, IndexError) as error:
    sys.exit(f'FAIL: malformed {args.environment} Firebase app config ({type(error).__name__})')

expected_ios = {'development': 'com.brightwhitemobile.dev',
                'uat': 'com.brightwhitemobile.uat',
                'production': 'com.brightwhitemobile'}[args.environment]
expected_android = 'com.brightwhitemobile.uat' if args.environment == 'uat' else 'com.brightwhitemobile'
if expected_android not in packages or ios_bundle != expected_ios or project != ios_project:
    sys.exit(f'FAIL: {args.environment} Firebase app identifiers do not match')

for other in ('development', 'uat', 'production'):
    if other == args.environment:
        continue
    other_android = root / 'config' / 'firebase' / other / 'google-services.json'
    if other_android.is_file():
        other_project = json.loads(other_android.read_text())['project_info']['project_id']
        if other_project == project:
            sys.exit('FAIL: Firebase environments share one project')

if args.stage:
    for source_file, target in ((android, root / 'android/app/google-services.json'),
                                (ios, root / 'ios/BrightWhiteMobile/GoogleService-Info.plist')):
        shutil.copyfile(source_file, target)
        target.chmod(0o600)
    (root / 'config/firebase/.staged-environment').write_text(args.environment + '\n')
    print(f'PASS: staged ignored {args.environment} Firebase app configs')
else:
    print(f'PASS: {args.environment} Firebase app configs validated')
