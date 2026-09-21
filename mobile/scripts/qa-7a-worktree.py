#!/usr/bin/env python3
"""Allowlist and checkpoint reviewed 7A files in the two Git repositories."""
import pathlib
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parents[2]
repos = {
    root / 'backend': {'src/app.module.ts', 'src/common/guards/supabase-auth.guard.ts',
        'src/modules/auth/auth.service.ts', 'src/modules/auth/auth.service.spec.ts',
        'src/modules/staff/dto/provision-staff.dto.ts', 'src/modules/staff/staff.controller.ts',
        'src/modules/staff/staff.module.ts', 'src/modules/staff/staff.service.ts',
        'src/modules/staff/staff.service.spec.ts', 'scripts/7a-functional-acceptance.cjs',
        'supabase/migrations/20260918200000_7a_staff_account_safety.sql',
        'supabase/tests/7a_staff_account_safety.sql'},
    root / 'mobile': {'App.tsx', 'src/navigation/types.ts',
        'src/screens/DriverProfileScreen.tsx', 'src/screens/DriverProfileScreen.test.tsx',
        'src/services/driverProfileApi.ts', 'src/services/driverProfileApi.test.ts',
        'scripts/qa-7a-worktree.py', 'scripts/driver-auth-milestone.sh'},
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
    for repo, baseline in zip(repos, ('b6faeaf', 'de2c520')):
        if git(repo, 'cat-file', '-t', baseline).strip() != 'commit':
            raise RuntimeError(f'{repo.name}: baseline missing')
        if git(repo, 'diff', '--cached', '--name-only'):
            raise RuntimeError(f'{repo.name}: pre-staged files present')
        files = changed(repo)
        if not files:
            raise RuntimeError(f'{repo.name}: expected 7A changes absent')
        git(repo, 'diff', '--check')
        for path in files:
            print(f'{repo.name}: {path}')
    print('PASS: reviewed 7A changes only')

def checkpoint():
    verify()
    for repo in repos:
        git(repo, 'add', '--', *changed(repo))
    for repo in repos:
        git(repo, 'commit', '-m', 'checkpoint(7A): admin-provisioned driver authentication')
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
        raise RuntimeError('Usage: qa-7a-worktree.py verify|commit')
except (RuntimeError, subprocess.CalledProcessError) as error:
    print(f'FAIL: {error}', file=sys.stderr)
    sys.exit(1)
