#!/usr/bin/env python3
"""Allowlist and checkpoint the 7D Driver GPS in the existing backend/mobile repos."""
import pathlib
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parents[2]
repos = {
    root / 'backend': {
        'src/modules/logistics/dto/update-driver-location.dto.ts',
        'src/modules/logistics/logistics.controller.ts', 'src/modules/logistics/logistics.service.ts',
        'src/modules/logistics/logistics.service.spec.ts',
        'src/modules/drivers/drivers.controller.ts', 'src/modules/drivers/drivers.service.ts',
        'supabase/migrations/20260918220000_7d_assignment_scoped_driver_gps.sql',
        'scripts/7d-functional-acceptance.cjs',
        'scripts/7d-device-fixture.cjs',
    },
    root / 'mobile': {
        'App.tsx',
        'android/app/src/main/AndroidManifest.xml',
        'android/app/src/main/java/com/brightwhitemobile/MainApplication.kt',
        'android/app/src/main/java/com/brightwhitemobile/DriverTripLocationPackage.kt',
        'android/app/src/main/java/com/brightwhitemobile/DriverTripLocationService.kt',
        'ios/BrightWhiteMobile/Info.plist',
        'ios/BrightWhiteMobile/BWDriverTripLocation.m',
        'ios/BrightWhiteMobile.xcodeproj/project.pbxproj',
        'src/services/driverTripBackground.ts',
        'src/services/driverTripBackground.test.ts',
        'src/services/deviceLocationService.ts', 'src/services/driverAssignmentsApi.ts',
        'src/services/driverAssignmentsApi.test.ts', 'src/screens/DriverJobDetailScreen.tsx',
        'src/screens/DriverJobDetailScreen.test.tsx', 'scripts/driver-gps-milestone.sh',
        'scripts/qa-7d-worktree.py',
        'scripts/qa-7d-device-acceptance.py',
    },
}

def git(repo, *args):
    return subprocess.run(['git', '-C', str(repo), *args], check=True,
                          capture_output=True, text=True).stdout

def changed(repo):
    files = []
    for entry in git(repo, 'status', '--porcelain=v1', '--untracked-files=all', '-z').split('\0'):
        if not entry:
            continue
        if entry[:2] not in (' M', '??') or entry[3:] not in repos[repo]:
            raise RuntimeError(f'{repo.name}: unrelated or unexpected change {entry[3:]}')
        files.append(entry[3:])
    return files

def verify():
    for repo, baseline in zip(repos, ('cd2a9c9', '42398f3')):
        if git(repo, 'cat-file', '-t', baseline).strip() != 'commit':
            raise RuntimeError(f'{repo.name}: 7C baseline missing')
        if git(repo, 'diff', '--cached', '--name-only'):
            raise RuntimeError(f'{repo.name}: pre-staged files present')
        files = changed(repo)
        if not files:
            raise RuntimeError(f'{repo.name}: expected 7D changes absent')
        git(repo, 'diff', '--check')
        for path in files:
            print(f'{repo.name}: {path}')
    print('PASS: reviewed 7D changes only')

def checkpoint():
    verify()
    for repo in repos:
        git(repo, 'add', '--', *changed(repo))
    for repo in repos:
        git(repo, 'commit', '-m', 'checkpoint(7D): pickup navigation and live GPS')
        print(f'{repo.name} checkpoint: {git(repo, "rev-parse", "--short", "HEAD").strip()}')
    for repo in repos:
        if git(repo, 'status', '--porcelain'):
            raise RuntimeError(f'{repo.name}: working tree not clean')

try:
    if sys.argv[1:] == ['verify']:
        verify()
    elif sys.argv[1:] == ['commit']:
        checkpoint()
    else:
        raise RuntimeError('Usage: qa-7d-worktree.py verify|commit')
except (RuntimeError, subprocess.CalledProcessError) as error:
    print(f'FAIL: {error}', file=sys.stderr)
    sys.exit(1)
