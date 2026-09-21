#!/usr/bin/env python3
"""Review and checkpoint only 8E QC and rewash changes."""
import pathlib
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parents[2]
repos = {
    root / 'backend': {'src/modules/facility/facility.service.ts', 'src/modules/facility/facility.controller.ts',
                       'src/modules/facility/facility.service.spec.ts', 'src/modules/facility/dto/quality-decision.dto.ts',
                       'supabase/migrations/20260920230000_8e_qc_rewash_audit.sql',
                       'supabase/migrations/20260920231000_8e_manager_reconciliation_after_rewash_cap.sql',
                       'scripts/7f-functional-acceptance.cjs'},
    root / 'mobile': {'src/screens/FacilityVerificationScreen.tsx',
                      'src/screens/FacilityProcessingPanel.tsx', 'src/screens/FacilityProcessingPanel.test.tsx',
                      'src/services/facilityProcessingApi.ts', 'src/services/facilityProcessingApi.test.ts',
                      'scripts/facility-quality-milestone.sh', 'scripts/qa-8e-worktree.py'},
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
    for repo, baseline in zip(repos, ('ad35bf3', '844d2ff')):
        if git(repo, 'rev-parse', '--short', 'HEAD').strip() != baseline:
            raise RuntimeError(f'{repo.name}: 8D baseline moved')
        if git(repo, 'diff', '--cached', '--name-only'):
            raise RuntimeError(f'{repo.name}: pre-staged changes present')
        files = changed(repo)
        if not files:
            raise RuntimeError(f'{repo.name}: expected 8E changes absent')
        git(repo, 'diff', '--check')
        for file in files:
            print(f'{repo.name}: {file}')
    print('PASS: reviewed 8E changes only')

def checkpoint():
    verify()
    for repo in repos:
        git(repo, 'add', '--', *changed(repo))
    for repo in repos:
        git(repo, 'commit', '-m', 'checkpoint(8E): facility QC and capped rewash')
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
        raise RuntimeError('Usage: qa-8e-worktree.py verify|commit')
except (RuntimeError, subprocess.CalledProcessError) as error:
    print(f'FAIL: {error}', file=sys.stderr)
    sys.exit(1)
