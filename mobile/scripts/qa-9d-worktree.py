#!/usr/bin/env python3
"""Allow only reviewed 9D changes on clean 9C checkpoints."""
import pathlib
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parents[2]
repos = {
    root / 'backend': ('b9f7632', {
        'src/modules/admin-management/admin-assignments.controller.ts',
        'src/modules/admin-management/admin-assignments.service.ts',
        'src/modules/admin-management/admin-assignments.service.spec.ts',
        'src/modules/admin-management/admin-management.module.ts',
        'supabase/migrations/20260920270000_9d_admin_assignment_operations.sql',
        'scripts/9d-functional-acceptance.cjs',
    }),
    root / 'mobile': ('44f6171', {
        'App.tsx', 'src/navigation/types.ts', 'src/screens/AdminDashboardScreen.tsx',
        'src/screens/AdminAssignmentsScreen.tsx', 'src/screens/AdminAssignmentsScreen.test.tsx',
        'src/services/adminAssignmentsApi.ts', 'src/services/adminAssignmentsApi.test.ts',
        'scripts/admin-assignments-milestone.sh', 'scripts/qa-9d-worktree.py',
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
            raise RuntimeError(f'{repo.name}: 9C baseline moved')
        if git(repo, 'diff', '--cached', '--name-only'):
            raise RuntimeError(f'{repo.name}: pre-staged changes present')
        files = changed(repo, allowed)
        if not files:
            raise RuntimeError(f'{repo.name}: expected 9D changes absent')
        git(repo, 'diff', '--check')
        for file in files:
            print(f'{repo.name}: {file}')
    print('PASS: clean 9C baselines and reviewed 9D files only')


def checkpoint():
    verify()
    for repo, (_, allowed) in repos.items():
        git(repo, 'add', '--', *changed(repo, allowed))
    for repo in repos:
        git(repo, 'commit', '-m', 'checkpoint(9D): admin assignment and reassignment operations')
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
        raise RuntimeError('Usage: qa-9d-worktree.py verify|commit')
except (RuntimeError, subprocess.CalledProcessError) as error:
    print(f'FAIL: {error}', file=sys.stderr)
    sys.exit(1)
