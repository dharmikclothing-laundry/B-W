#!/usr/bin/env python3
"""Commit only reviewed 9E files from clean 9D checkpoints."""
import pathlib
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parents[2]
repos = {
    root / 'backend': ('1aa75b7', {
        'src/modules/admin-management/admin-management.module.ts',
        'src/modules/admin-management/admin-catalogue.controller.ts',
        'src/modules/admin-management/admin-catalogue.service.ts',
        'src/modules/admin-management/admin-catalogue.service.spec.ts',
        'src/modules/orders/order-pricing.ts', 'src/modules/orders/order-pricing.spec.ts',
        'src/modules/orders/orders.service.ts', 'src/modules/orders/orders.service.spec.ts',
        'src/modules/services/services.service.ts', 'src/modules/services/services.service.spec.ts',
        'src/modules/services/services.controller.ts',
        'supabase/migrations/20260920280000_9e_admin_catalogue_pricing.sql',
        'supabase/migrations/20260920281000_9e_minimum_order_package_eligibility.sql',
        'scripts/9e-functional-acceptance.cjs',
    }),
    root / 'mobile': ('881dae1', {
        'App.tsx', 'src/navigation/types.ts', 'src/screens/AdminDashboardScreen.tsx',
        'src/screens/AdminCatalogueScreen.tsx', 'src/screens/AdminCatalogueScreen.test.tsx',
        'src/screens/CartScreen.tsx', 'src/screens/OrderReviewScreen.tsx', 'src/screens/OrderReviewScreen.test.tsx',
        'src/services/adminCatalogueApi.ts', 'src/services/adminCatalogueApi.test.ts',
        'src/services/servicesApi.ts', 'src/utils/orderPricing.ts', 'src/utils/orderPricing.test.ts',
        'scripts/admin-catalogue-milestone.sh', 'scripts/qa-9e-worktree.py',
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
            raise RuntimeError(f'{repo.name}: 9D baseline moved')
        if git(repo, 'diff', '--cached', '--name-only'):
            raise RuntimeError(f'{repo.name}: pre-staged changes present')
        files = changed(repo, allowed)
        if not files:
            raise RuntimeError(f'{repo.name}: expected 9E changes absent')
        git(repo, 'diff', '--check')
        for file in files:
            print(f'{repo.name}: {file}')
    print('PASS: clean 9D baselines and reviewed 9E files only')


def checkpoint():
    verify()
    for repo, (_, allowed) in repos.items():
        git(repo, 'add', '--', *changed(repo, allowed))
    for repo in repos:
        git(repo, 'commit', '-m', 'checkpoint(9E): admin services pricing and catalogue')
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
        raise RuntimeError('Usage: qa-9e-worktree.py verify|commit')
except (RuntimeError, subprocess.CalledProcessError) as error:
    print(f'FAIL: {error}', file=sys.stderr)
    sys.exit(1)
