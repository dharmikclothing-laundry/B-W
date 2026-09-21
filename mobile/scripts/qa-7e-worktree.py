#!/usr/bin/env python3
"""Allowlist and checkpoint 7E pickup OTP and garment handover."""
import pathlib
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parents[2]
repos = {
    root / 'backend': {
        'src/modules/drivers/drivers.service.ts',
        'src/modules/drivers/drivers.service.spec.ts',
        'scripts/7e-functional-acceptance.cjs',
    },
    root / 'mobile': {
        'src/services/driverAssignmentsApi.ts',
        'src/services/driverAssignmentsApi.test.ts',
        'src/screens/DriverJobDetailScreen.tsx',
        'src/screens/DriverJobDetailScreen.test.tsx',
        'scripts/driver-pickup-milestone.sh',
        'scripts/qa-7e-worktree.py',
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
    for repo, baseline in zip(repos, ('c7b2296', 'f3f6fe9')):
        if git(repo, 'cat-file', '-t', baseline).strip() != 'commit':
            raise RuntimeError(f'{repo.name}: 7D baseline missing')
        if git(repo, 'diff', '--cached', '--name-only'):
            raise RuntimeError(f'{repo.name}: pre-staged files present')
        files = changed(repo)
        if not files:
            raise RuntimeError(f'{repo.name}: expected 7E changes absent')
        git(repo, 'diff', '--check')
        for path in files:
            print(f'{repo.name}: {path}')
    print('PASS: reviewed 7E changes only')

def checkpoint():
    verify()
    for repo in repos:
        git(repo, 'add', '--', *changed(repo))
    for repo in repos:
        git(repo, 'commit', '-m', 'checkpoint(7E): pickup OTP and garment handover')
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
        raise RuntimeError('Usage: qa-7e-worktree.py verify|commit')
except (RuntimeError, subprocess.CalledProcessError) as error:
    print(f'FAIL: {error}', file=sys.stderr)
    sys.exit(1)
