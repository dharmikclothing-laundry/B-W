#!/usr/bin/env python3
"""Read-only 6U checks. Never print credential values."""
import pathlib
import os
import re
import subprocess
import sys
from urllib.parse import urlparse

root = pathlib.Path(__file__).resolve().parents[2]
mobile = root / 'mobile'
backend = root / 'backend'


def env_values(path):
    values = {}
    for line in path.read_text().splitlines():
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        key, separator, value = line.partition('=')
        if separator:
            values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def production_api_ready():
    local_env = env_values(mobile / '.env') if (mobile / '.env').is_file() else {}
    endpoint = urlparse(os.environ.get('BW_PRODUCTION_API_URL') or local_env.get('BW_PRODUCTION_API_URL', ''))
    return (endpoint.scheme == 'https' and bool(endpoint.hostname)
            and endpoint.hostname not in ('localhost', '127.0.0.1', 'api.example.com')
            and not endpoint.username and not endpoint.password and not endpoint.fragment)


def production_firebase_ready():
    source = mobile / 'config/firebase/production'
    marker = mobile / 'config/firebase/.staged-environment'
    if not marker.is_file() or marker.read_text().strip() != 'production':
        return False
    checks = ((source / 'google-services.json', mobile / 'android/app/google-services.json'),
              (source / 'GoogleService-Info.plist', mobile / 'ios/BrightWhiteMobile/GoogleService-Info.plist'))
    if not all(original.is_file() and staged.is_file() and original.read_bytes() == staged.read_bytes()
               for original, staged in checks):
        return False
    result = subprocess.run([sys.executable, str(mobile / 'scripts/stage-firebase-config.py'),
                             'production'], capture_output=True, check=False)
    return result.returncode == 0


def local_safety():
    path = backend / '.env'
    if not path.is_file():
        print('FAIL: backend local configuration is missing')
        return 1
    values = env_values(path)
    local = {'localhost', '127.0.0.1', '::1'}
    safe = (values.get('NODE_ENV') != 'production'
            and urlparse(values.get('SUPABASE_URL', '')).hostname in local
            and urlparse(values.get('REDIS_URL', 'redis://localhost:6379')).hostname in local
            and values.get('GOOGLE_MAPS_MODE', 'mock') == 'mock'
            and values.get('RAZORPAY_MODE', 'mock') == 'mock')
    firebase_keys = ('FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL',
                     'FIREBASE_PRIVATE_KEY', 'GOOGLE_APPLICATION_CREDENTIALS',
                     'GOOGLE_CLOUD_PROJECT', 'GCLOUD_PROJECT')
    safe = safe and not any(values.get(key) or os.environ.get(key) for key in firebase_keys)
    print('PASS: local Supabase and mock providers' if safe else 'FAIL: nonlocal or live provider configuration')
    return 0 if safe else 1


def tracked_secret_scan():
    patterns = [
        re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
        re.compile(rb'rzp_live_[A-Za-z0-9]{8,}'),
        re.compile(rb'sb_secret_[A-Za-z0-9]{10,}'),
        re.compile(rb'AKIA[0-9A-Z]{16}'),
        re.compile(rb'gh[pousr]_[A-Za-z0-9]{20,}'),
        re.compile(rb'eyJ[A-Za-z0-9_-]{30,}\.eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}'),
    ]
    found = []
    for repo in (backend, mobile):
        names = subprocess.check_output(
            ['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=repo
        ).split(b'\0')
        for name in names:
            if not name:
                continue
            path = repo / name.decode('utf-8', 'surrogateescape')
            if not path.is_file() or path.stat().st_size > 2_000_000:
                continue
            content = path.read_bytes()
            if any(pattern.search(content) for pattern in patterns):
                found.append(f'{repo.name}/{name.decode("utf-8", "replace")}')
    if found:
        print('FAIL: possible secret patterns in tracked files: ' + ', '.join(found))
        return 1
    print('PASS: no high-confidence secrets in tracked files')
    return 0


def android_readiness():
    gradle = (mobile / 'android/app/build.gradle').read_text()
    signed_with_debug = bool(re.search(r'release\s*\{[^}]*signingConfig\s+signingConfigs\.debug', gradle, re.S))
    private_gradle = pathlib.Path.home() / '.gradle/gradle.properties'
    private_values = env_values(private_gradle) if private_gradle.is_file() else {}
    setting = lambda key: os.environ.get(key) or private_values.get(key)
    signing = [setting(key) for key in ('BW_RELEASE_STORE_FILE', 'BW_RELEASE_STORE_PASSWORD', 'BW_RELEASE_KEY_ALIAS', 'BW_RELEASE_KEY_PASSWORD')]
    store_path = pathlib.Path(signing[0]) if signing[0] else None
    signing_ready = bool(all(signing) and store_path and (
        store_path.is_file() or (mobile / 'android/app' / store_path).is_file()))
    api_ready = production_api_ready()
    missing_fcm = not (mobile / 'android/app/google-services.json').is_file()
    reasons = []
    if signed_with_debug: reasons.append('release uses debug signing')
    if not signing_ready: reasons.append('private release signing is not configured')
    if not setting('BW_RELEASE_GOOGLE_MAPS_ANDROID_API_KEY'): reasons.append('separate Android release Maps key is not configured')
    if not api_ready: reasons.append('HTTPS production API URL is not configured')
    if missing_fcm: reasons.append('Android FCM configuration is missing')
    if not production_firebase_ready(): reasons.append('validated Production Firebase configuration is not staged')
    print('FAIL: ' + '; '.join(reasons) if reasons else 'PASS: Android release configuration ready')
    return 1 if reasons else 0


def ios_readiness():
    project = (mobile / 'ios/BrightWhiteMobile.xcodeproj/project.pbxproj').read_text()
    podfile = (mobile / 'ios/Podfile').read_text()
    reasons = []
    if 'org.reactjs.native.example' in project: reasons.append('template bundle identifier remains')
    if not (mobile / 'ios/BrightWhiteMobile/GoogleService-Info.plist').is_file(): reasons.append('iOS Firebase configuration is missing')
    if not os.environ.get('BW_IOS_RELEASE_TEAM'): reasons.append('distribution Apple team is unset')
    if "pod 'react-native-google-maps'" not in podfile: reasons.append('iOS Google Maps native SDK is not configured')
    if not os.environ.get('BW_IOS_GOOGLE_MAPS_API_KEY'): reasons.append('iOS release Maps key is not configured')
    if not production_firebase_ready(): reasons.append('validated Production Firebase configuration is not staged')
    if not production_api_ready():
        reasons.append('HTTPS production API URL is not configured')
    print('FAIL: ' + '; '.join(reasons) if reasons else 'PASS: iOS release configuration ready')
    return 1 if reasons else 0


checks = {'local-safety': local_safety, 'secrets': tracked_secret_scan,
          'android-readiness': android_readiness, 'ios-readiness': ios_readiness}
if len(sys.argv) != 2 or sys.argv[1] not in checks:
    print('Usage: qa-release-audit.py <local-safety|secrets|android-readiness|ios-readiness>')
    sys.exit(2)
sys.exit(checks[sys.argv[1]]())
