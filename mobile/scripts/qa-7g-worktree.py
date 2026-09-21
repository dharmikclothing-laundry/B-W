#!/usr/bin/env python3
"""Allowlist and checkpoint 7G delivery OTP and photo proof."""
import pathlib
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parents[2]
repos = {
    root / 'backend': {
        'scripts/7g-functional-acceptance.cjs',
    },
    root / 'mobile': {
        'src/services/driverDeliveryApi.ts',
        'src/services/driverDeliveryApi.test.ts',
        'src/screens/DriverJobDetailScreen.tsx',
        'src/screens/DriverJobDetailScreen.test.tsx',
        'scripts/driver-delivery-milestone.sh',
        'scripts/qa-7g-worktree.py',
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
    for repo, baseline in zip(repos, ('dcaee75', '2941b6a')):
        if git(repo, 'cat-file', '-t', baseline).strip() != 'commit':
            raise RuntimeError(f'{repo.name}: 7F baseline missing')
        if git(repo, 'diff', '--cached', '--name-only'):
            raise RuntimeError(f'{repo.name}: pre-staged files present')
        files = changed(repo)
        if not files:
            raise RuntimeError(f'{repo.name}: expected 7G changes absent')
        git(repo, 'diff', '--check')
        for path in files:
            print(f'{repo.name}: {path}')
    print('PASS: reviewed 7G changes only')

def checkpoint():
    verify()
    for repo in repos:
        git(repo, 'add', '--', *changed(repo))
    for repo in repos:
        git(repo, 'commit', '-m', 'checkpoint(7G): delivery OTP and photo proof')
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
        raise RuntimeError('Usage: qa-7g-worktree.py verify|commit')
except (RuntimeError, subprocess.CalledProcessError) as error:
    print(f'FAIL: {error}', file=sys.stderr)
    sys.exit(1)
