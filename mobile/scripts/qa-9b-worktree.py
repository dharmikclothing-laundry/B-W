#!/usr/bin/env python3
"""Checkpoint reviewed 9B changes only when all runner gates have passed."""
import pathlib
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parents[2]
repos = {
    root / 'backend': ('0f95ac1', {'scripts/9b-functional-acceptance.cjs'}),
    root / 'mobile': ('5866f06', {
        'App.tsx', 'src/screens/AdminCustomersScreen.tsx', 'src/screens/AdminCustomersScreen.test.tsx',
        'src/services/adminManagementApi.ts', 'src/services/adminManagementApi.test.ts',
        'scripts/admin-customer-orders-milestone.sh', 'scripts/qa-9b-worktree.py',
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
            raise RuntimeError(f'{repo.name}: reviewed 9B baseline moved')
        if git(repo, 'diff', '--cached', '--name-only'):
            raise RuntimeError(f'{repo.name}: pre-staged changes present')
        files = changed(repo, allowed)
        if allowed and not files:
            raise RuntimeError(f'{repo.name}: expected QR lookup changes absent')
        git(repo, 'diff', '--check')
        for file in files:
            print(f'{repo.name}: {file}')
    print('PASS: reviewed 9B baselines and QR lookup files only')


def checkpoint():
    verify()
    for repo, (_, allowed) in repos.items():
        files = changed(repo, allowed)
        if files:
            git(repo, 'add', '--', *files)
    for repo in repos:
        if git(repo, 'diff', '--cached', '--name-only'):
            git(repo, 'commit', '-m', 'checkpoint(9B): admin QR order lookup')
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
        raise RuntimeError('Usage: qa-9b-worktree.py verify|commit')
except (RuntimeError, subprocess.CalledProcessError) as error:
    print(f'FAIL: {error}', file=sys.stderr)
    sys.exit(1)
