#!/usr/bin/env python3
"""Commit only reviewed 9C files from clean 9B baselines."""
import pathlib
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parents[2]
repos = {
    root / 'backend': ('0482083', {
        'src/modules/staff/staff.controller.ts', 'src/modules/staff/staff.service.ts',
        'src/modules/staff/staff.service.spec.ts', 'test/app.e2e-spec.ts',
        'scripts/9c-functional-acceptance.cjs',
        'supabase/migrations/20260920260000_9c_admin_staff_audit.sql',
    }),
    root / 'mobile': ('a804bd3', {
        'App.tsx', 'src/navigation/types.ts', 'src/screens/AdminDashboardScreen.tsx',
        'src/screens/AdminStaffScreen.tsx', 'src/screens/AdminStaffScreen.test.tsx',
        'src/screens/AdminStaffListScreen.test.tsx', 'src/screens/AdminStaffErrorScreen.test.tsx',
        'src/screens/AdminStaffDetailScreen.tsx', 'src/screens/AdminStaffDetailScreen.test.tsx',
        'src/services/adminStaffApi.ts', 'src/services/adminStaffApi.test.ts',
        'scripts/admin-staff-management-milestone.sh', 'scripts/qa-9c-worktree.py',
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
            raise RuntimeError(f'{repo.name}: 9B baseline moved')
        if git(repo, 'diff', '--cached', '--name-only'):
            raise RuntimeError(f'{repo.name}: pre-staged changes present')
        files = changed(repo, allowed)
        if not files:
            raise RuntimeError(f'{repo.name}: expected 9C changes absent')
        git(repo, 'diff', '--check')
        for file in files:
            print(f'{repo.name}: {file}')
    print('PASS: clean 9B baselines and reviewed 9C files only')


def checkpoint():
    verify()
    for repo, (_, allowed) in repos.items():
        git(repo, 'add', '--', *changed(repo, allowed))
    for repo in repos:
        git(repo, 'commit', '-m', 'checkpoint(9C): admin driver and facility staff management')
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
        raise RuntimeError('Usage: qa-9c-worktree.py verify|commit')
except (RuntimeError, subprocess.CalledProcessError) as error:
    print(f'FAIL: {error}', file=sys.stderr)
    sys.exit(1)
