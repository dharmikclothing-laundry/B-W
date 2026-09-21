#!/usr/bin/env python3
"""Commit only reviewed 9G files from clean 9F checkpoints."""
import pathlib
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parents[2]
repos = {
    root / 'backend': ('28ba15c', {
        'src/modules/admin-management/admin-management.module.ts',
        'src/modules/admin-management/admin-growth.controller.ts',
        'src/modules/admin-management/admin-growth.service.ts',
        'src/modules/admin-management/admin-growth.service.spec.ts',
        'src/modules/growth/growth.controller.ts',
        'src/modules/growth/growth.service.ts',
        'src/modules/growth/growth.service.spec.ts',
        'src/modules/packages/packages.service.ts',
        'src/modules/packages/packages.service.spec.ts',
        'src/modules/orders/orders.service.ts',
        'src/modules/orders/orders.service.spec.ts',
        'test/app.e2e-spec.ts',
        'supabase/migrations/20260920293000_9g_admin_growth_programs.sql',
        'scripts/9g-functional-acceptance.cjs',
    }),
    root / 'mobile': ('87a36f2', {
        'App.tsx', 'src/navigation/types.ts', 'src/screens/AdminDashboardScreen.tsx',
        'src/screens/AdminGrowthScreen.tsx', 'src/screens/AdminGrowthScreen.test.tsx',
        'src/services/adminGrowthApi.ts', 'src/services/growthApi.ts',
        'src/components/LoyaltySection.tsx', 'src/components/LoyaltySection.test.tsx',
        'src/screens/OrderReviewScreen.tsx', 'src/screens/OrderReviewScreen.test.tsx',
        'scripts/admin-growth-milestone.sh', 'scripts/qa-9g-worktree.py',
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
            raise RuntimeError(f'{repo.name}: 9F baseline moved')
        if git(repo, 'diff', '--cached', '--name-only'):
            raise RuntimeError(f'{repo.name}: pre-staged changes present')
        files = changed(repo, allowed)
        if not files:
            raise RuntimeError(f'{repo.name}: expected 9G changes absent')
        git(repo, 'diff', '--check')
        for file in files:
            print(f'{repo.name}: {file}')
    print('PASS: clean 9F baselines and reviewed 9G files only')


def checkpoint():
    verify()
    for repo, (_, allowed) in repos.items():
        git(repo, 'add', '--', *changed(repo, allowed))
    for repo in repos:
        git(repo, 'commit', '-m', 'checkpoint(9G): admin growth programs')
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
        raise RuntimeError('Usage: qa-9g-worktree.py verify|commit')
except (RuntimeError, subprocess.CalledProcessError) as error:
    print(f'FAIL: {error}', file=sys.stderr)
    sys.exit(1)
