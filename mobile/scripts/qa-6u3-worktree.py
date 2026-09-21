#!/usr/bin/env python3
"""Allowlist and checkpoint the reviewed 6U work in the two existing repos."""
import pathlib
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parents[2]
mobile = root / 'mobile'
backend = root / 'backend'
allowed = {
    mobile: {
        '.env.example', '.gitignore', 'App.tsx', 'android/app/build.gradle',
        'android/build.gradle', 'ios/BrightWhiteMobile.xcodeproj/project.pbxproj',
        'ios/BrightWhiteMobile/Info.plist', 'ios/BrightWhiteMobile/BWNotificationPermission.m',
        'jest.config.js', 'jest.setup.js', 'scripts/final-customer-qa.sh',
        'scripts/qa-device-smoke.sh', 'scripts/qa-release-audit.py',
        'scripts/stage-firebase-config.py', 'scripts/qa-authenticated-e2e.py',
        'scripts/qa-6u3-worktree.py', 'scripts/pre-production-release-ready.sh',
        'src/components/OrderCareSection.tsx', 'src/components/OrderCareSection.test.tsx',
        'src/config/environment.ts', 'src/screens/NotificationsScreen.tsx',
        'src/screens/OrderDetailsScreen.tsx', 'src/services/api.ts',
        'src/services/api.test.ts', 'src/services/claimsApi.ts',
        'src/services/claimsApi.test.ts', 'src/services/orderCareApi.test.ts',
        'src/services/orderAttemptStorage.ts', 'src/services/orderAttemptStorage.test.ts',
        'src/services/ordersApi.ts', 'src/types/order.ts',
    },
    backend: {
        'src/modules/orders/dto/create-order.dto.ts',
        'src/modules/orders/orders.service.ts',
        'src/modules/orders/orders.service.spec.ts',
        'supabase/migrations/20260918190000_6u2_order_create_idempotency.sql',
        'supabase/tests/6u3_order_idempotency.sql',
    },
}


def git(repo, *args):
    return subprocess.run(['git', '-C', str(repo), *args], check=True,
                          capture_output=True, text=True).stdout


def verify():
    for repo, paths in allowed.items():
        if git(repo, 'diff', '--cached', '--name-only'):
            raise RuntimeError(f'{repo.name}: pre-staged files are present')
        status = git(repo, 'status', '--porcelain', '-z')
        changed = set()
        for entry in status.split('\0'):
            if not entry:
                continue
            if entry[:2] not in (' M', '??'):
                raise RuntimeError(f'{repo.name}: unexpected Git operation')
            path = entry[3:]
            if path not in paths:
                raise RuntimeError(f'{repo.name}: unexpected changed file {path}')
            changed.add(path)
        if not changed:
            raise RuntimeError(f'{repo.name}: expected 6U changes are absent')
        git(repo, 'diff', '--check')
    print('PASS: only reviewed 6U source changes are pending')


def commit():
    verify()
    for repo, paths in allowed.items():
        changed = set()
        for entry in git(repo, 'status', '--porcelain', '-z').split('\0'):
            if entry:
                changed.add(entry[3:])
        git(repo, 'add', '--', *sorted(changed))
    for repo in (backend, mobile):
        git(repo, 'commit', '-m', 'checkpoint(pre-production-release-ready): 6U.3 engineering baseline')
        print(f'{repo.name} checkpoint: {git(repo, "rev-parse", "--short", "HEAD")}')
    for repo in (backend, mobile):
        if git(repo, 'status', '--porcelain'):
            raise RuntimeError(f'{repo.name}: working tree remains dirty after checkpoint')
    print('PASS: both working trees are clean')


if __name__ == '__main__':
    try:
        if sys.argv[1:] == ['verify']:
            verify()
        elif sys.argv[1:] == ['commit']:
            commit()
        else:
            raise RuntimeError('Usage: qa-6u3-worktree.py verify|commit')
    except (RuntimeError, subprocess.CalledProcessError) as error:
        print(f'FAIL: {error}', file=sys.stderr)
        sys.exit(1)
