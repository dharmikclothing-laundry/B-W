#!/usr/bin/env python3
"""Allow only reviewed 9I files from clean 9H checkpoints."""
import pathlib
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parents[2]
repos = {
    root / 'backend': ('a3927fb', {
        'src/modules/analytics/analytics.module.ts',
        'src/modules/analytics/analytics-reports.controller.ts',
        'src/modules/analytics/analytics-reports.service.ts',
        'src/modules/analytics/analytics-reports.service.spec.ts',
        'test/app.e2e-spec.ts', 'scripts/9i-functional-acceptance.cjs',
    }),
    root / 'mobile': ('3674626', {
        'App.tsx', 'src/navigation/types.ts', 'src/screens/AdminDashboardScreen.tsx',
        'src/screens/AdminReportsScreen.tsx', 'src/screens/AdminReportsScreen.test.tsx',
        'src/services/adminReportsApi.ts', 'src/services/adminReportsApi.test.ts',
        'scripts/admin-analytics-milestone.sh', 'scripts/qa-9i-worktree.py',
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
            raise RuntimeError(f'{repo.name}: 9H baseline moved')
        if git(repo, 'diff', '--cached', '--name-only'):
            raise RuntimeError(f'{repo.name}: pre-staged changes present')
        files = changed(repo, allowed)
        if not files:
            raise RuntimeError(f'{repo.name}: expected 9I changes absent')
        git(repo, 'diff', '--check')
        for file in files:
            print(f'{repo.name}: {file}')
    print('PASS: clean 9H baselines and reviewed 9I files only')


def checkpoint():
    verify()
    for repo, (_, allowed) in repos.items():
        git(repo, 'add', '--', *changed(repo, allowed))
    for repo in repos:
        git(repo, 'commit', '-m', 'checkpoint(9I): admin analytics and audit logs')
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
        raise RuntimeError('Usage: qa-9i-worktree.py verify|commit')
except (RuntimeError, subprocess.CalledProcessError) as error:
    print(f'FAIL: {error}', file=sys.stderr)
    sys.exit(1)
