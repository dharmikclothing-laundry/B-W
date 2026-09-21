#!/usr/bin/env python3
"""Review and checkpoint only 8C garment verification changes."""
import pathlib
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parents[2]
repos = {
    root / 'backend': {'src/modules/facility/facility.service.ts', 'src/modules/facility/facility.controller.ts',
                       'src/modules/facility/facility.verification.spec.ts',
                       'src/modules/facility/dto/verify-intake.dto.ts',
                       'supabase/migrations/20260920200000_8c_facility_intake_verification.sql',
                       'supabase/migrations/20260920210000_8c_require_measured_intake_before_processing.sql',
                       'scripts/7f-functional-acceptance.cjs', 'scripts/7g-functional-acceptance.cjs',
                       'scripts/runtime-gates-4-6.cjs'},
    root / 'mobile': {'App.tsx', 'src/navigation/types.ts', 'src/screens/FacilityDashboardScreen.tsx',
                      'src/screens/FacilityDashboardScreen.test.tsx',
                      'src/screens/FacilityVerificationScreen.tsx', 'src/screens/FacilityVerificationScreen.test.tsx',
                      'src/services/facilityVerificationApi.ts', 'src/services/facilityVerificationApi.test.ts',
                      'scripts/facility-verification-milestone.sh', 'scripts/qa-8c-worktree.py'},
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
    for repo, baseline in zip(repos, ('cf740ea', '357db55')):
        if git(repo, 'rev-parse', '--short', 'HEAD').strip() != baseline:
            raise RuntimeError(f'{repo.name}: 8B baseline moved')
        if git(repo, 'diff', '--cached', '--name-only'):
            raise RuntimeError(f'{repo.name}: pre-staged changes present')
        files = changed(repo)
        if not files:
            raise RuntimeError(f'{repo.name}: expected 8C changes absent')
        git(repo, 'diff', '--check')
        for file in files:
            print(f'{repo.name}: {file}')
    print('PASS: reviewed 8C changes only')

def checkpoint():
    verify()
    for repo in repos:
        git(repo, 'add', '--', *changed(repo))
    for repo in repos:
        git(repo, 'commit', '-m', 'checkpoint(8C): garment verification and discrepancy audit')
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
        raise RuntimeError('Usage: qa-8c-worktree.py verify|commit')
except (RuntimeError, subprocess.CalledProcessError) as error:
    print(f'FAIL: {error}', file=sys.stderr)
    sys.exit(1)
