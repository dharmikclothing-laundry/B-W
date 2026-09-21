#!/usr/bin/env python3
"""Commit only reviewed 9F files from clean 9E checkpoints."""
import pathlib
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parents[2]
repos = {
    root / 'backend': ('99f4d48', {
        'src/modules/admin-management/admin-management.module.ts',
        'src/modules/admin-management/admin-issues.controller.ts',
        'src/modules/admin-management/admin-issues.service.ts',
        'src/modules/admin-management/admin-issues.service.spec.ts',
        'src/modules/payments/payments.controller.ts',
        'src/modules/payments/payments.service.ts',
        'src/modules/payments/payments.service.spec.ts',
        'test/app.e2e-spec.ts',
        'supabase/migrations/20260920290000_9f_admin_claim_refund_decisions.sql',
        'scripts/9f-functional-acceptance.cjs',
    }),
    root / 'mobile': ('9503509', {
        'App.tsx', 'src/navigation/types.ts', 'src/screens/AdminDashboardScreen.tsx',
        'src/screens/AdminIssuesScreen.tsx', 'src/screens/AdminIssueDetailScreen.tsx',
        'src/screens/AdminIssuesScreens.test.tsx', 'src/services/adminIssuesApi.ts',
        'src/services/adminIssuesApi.test.ts',
        'scripts/admin-issues-milestone.sh', 'scripts/qa-9f-worktree.py',
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
            raise RuntimeError(f'{repo.name}: 9E baseline moved')
        if git(repo, 'diff', '--cached', '--name-only'):
            raise RuntimeError(f'{repo.name}: pre-staged changes present')
        files = changed(repo, allowed)
        if not files:
            raise RuntimeError(f'{repo.name}: expected 9F changes absent')
        git(repo, 'diff', '--check')
        for file in files:
            print(f'{repo.name}: {file}')
    print('PASS: clean 9E baselines and reviewed 9F files only')


def checkpoint():
    verify()
    for repo, (_, allowed) in repos.items():
        git(repo, 'add', '--', *changed(repo, allowed))
    for repo in repos:
        git(repo, 'commit', '-m', 'checkpoint(9F): admin claims cancellation and refunds')
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
        raise RuntimeError('Usage: qa-9f-worktree.py verify|commit')
except (RuntimeError, subprocess.CalledProcessError) as error:
    print(f'FAIL: {error}', file=sys.stderr)
    sys.exit(1)
