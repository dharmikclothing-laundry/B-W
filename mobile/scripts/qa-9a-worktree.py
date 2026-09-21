#!/usr/bin/env python3
"""Checkpoint only reviewed 9A changes against clean 8G baselines."""
import pathlib
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parents[2]
repos = {
    root / 'backend': ('71d72aa', {
        'src/common/guards/supabase-auth.guard.ts',
        'src/modules/analytics/analytics.service.ts', 'src/modules/analytics/analytics.service.spec.ts',
        'src/modules/auth/auth.service.spec.ts', 'test/app.e2e-spec.ts',
        'supabase/config.toml', 'scripts/9a-functional-acceptance.cjs', 'scripts/9a-device-fixture.cjs',
    }),
    root / 'mobile': ('c8b854f', {
        'App.tsx', 'src/navigation/types.ts', 'src/services/driverProfileApi.test.ts',
        'src/services/adminDashboardApi.ts', 'src/services/adminDashboardApi.test.ts',
        'src/screens/AdminDashboardScreen.tsx', 'src/screens/AdminDashboardScreen.test.tsx',
        'scripts/admin-auth-dashboard-milestone.sh', 'scripts/qa-9a-worktree.py',
        'scripts/qa-admin-android.py',
    }),
}


def git(repo, *args):
    return subprocess.run(['git', '-C', str(repo), *args], check=True,
                          capture_output=True, text=True).stdout


def changed(repo, allowed):
    files = []
    for entry in git(repo, 'status', '--porcelain=v1', '--untracked-files=all', '-z').split('\0'):
        if not entry:
            continue
        if entry[:2] not in (' M', '??') or entry[3:] not in allowed:
            raise RuntimeError(f'{repo.name}: unexpected change {entry[3:]}')
        files.append(entry[3:])
    return files


def verify():
    for repo, (baseline, allowed) in repos.items():
        if git(repo, 'rev-parse', '--short', 'HEAD').strip() != baseline:
            raise RuntimeError(f'{repo.name}: 8G baseline moved')
        if git(repo, 'diff', '--cached', '--name-only'):
            raise RuntimeError(f'{repo.name}: pre-staged changes present')
        files = changed(repo, allowed)
        if not files:
            raise RuntimeError(f'{repo.name}: expected 9A changes absent')
        git(repo, 'diff', '--check')
        for file in files:
            print(f'{repo.name}: {file}')
    print('PASS: clean 8G baselines and reviewed 9A files only')


def checkpoint():
    verify()
    for repo, (_, allowed) in repos.items():
        git(repo, 'add', '--', *changed(repo, allowed))
    for repo in repos:
        git(repo, 'commit', '-m', 'checkpoint(9A): privileged admin authentication and dashboard')
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
        raise RuntimeError('Usage: qa-9a-worktree.py verify|commit')
except (RuntimeError, subprocess.CalledProcessError) as error:
    print(f'FAIL: {error}', file=sys.stderr)
    sys.exit(1)
