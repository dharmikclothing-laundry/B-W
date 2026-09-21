#!/usr/bin/env python3
"""Review and checkpoint only 8F packing and readiness changes."""
import pathlib
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parents[2]
repos = {
    root / 'backend': {'src/modules/facility/facility.service.ts', 'src/modules/facility/facility.controller.ts',
                       'src/modules/facility/facility.packing.spec.ts', 'src/modules/facility/dto/confirm-packing.dto.ts',
                       'supabase/migrations/20260920240000_8f_packing_before_readiness.sql',
                       'supabase/migrations/20260920241000_8f_packing_audit_order_cleanup.sql',
                       'supabase/migrations/20260920242000_8f_packing_item_cleanup.sql',
                       'scripts/7f-functional-acceptance.cjs'},
    root / 'mobile': {'src/screens/FacilityVerificationScreen.tsx',
                      'src/screens/FacilityVerificationScreen.test.tsx', 'src/screens/FacilityProcessingPanel.tsx',
                      'src/screens/FacilityPackingPanel.tsx', 'src/screens/FacilityPackingPanel.test.tsx',
                      'src/services/facilityPackingApi.ts', 'src/services/facilityPackingApi.test.ts',
                      'scripts/facility-packing-milestone.sh', 'scripts/qa-8f-worktree.py'},
}

def git(repo, *args):
    return subprocess.run(['git', '-C', str(repo), *args], check=True, capture_output=True, text=True).stdout

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
    for repo, baseline in zip(repos, ('1c6bc1d', 'f09ecab')):
        if git(repo, 'rev-parse', '--short', 'HEAD').strip() != baseline:
            raise RuntimeError(f'{repo.name}: 8E baseline moved')
        if git(repo, 'diff', '--cached', '--name-only'):
            raise RuntimeError(f'{repo.name}: pre-staged changes present')
        files = changed(repo)
        if not files:
            raise RuntimeError(f'{repo.name}: expected 8F changes absent')
        git(repo, 'diff', '--check')
        for file in files:
            print(f'{repo.name}: {file}')
    print('PASS: reviewed 8F changes only')

def checkpoint():
    verify()
    for repo in repos:
        git(repo, 'add', '--', *changed(repo))
    for repo in repos:
        git(repo, 'commit', '-m', 'checkpoint(8F): final packing and delivery readiness')
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
        raise RuntimeError('Usage: qa-8f-worktree.py verify|commit')
except (RuntimeError, subprocess.CalledProcessError) as error:
    print(f'FAIL: {error}', file=sys.stderr)
    sys.exit(1)
