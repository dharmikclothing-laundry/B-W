#!/usr/bin/env python3
"""Review and checkpoint only the 8A Facility authentication/dashboard change set."""
import pathlib
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parents[2]
repos = {
    root / 'backend': {'supabase/config.toml', 'src/modules/auth/auth.service.ts', 'src/modules/auth/auth.service.spec.ts',
                       'src/common/guards/supabase-auth.guard.ts', 'src/modules/facility/facility.service.ts',
                       'src/modules/facility/facility.controller.ts', 'src/modules/facility/facility.service.spec.ts',
                       'src/modules/facility/facility.dashboard.spec.ts', 'scripts/8a-functional-acceptance.cjs'},
    root / 'mobile': {'App.tsx', 'src/navigation/types.ts', 'src/services/facilityDashboardApi.ts',
                      'src/services/facilityDashboardApi.test.ts', 'src/screens/FacilityDashboardScreen.tsx',
                      'src/screens/FacilityDashboardScreen.test.tsx', 'scripts/facility-auth-dashboard-milestone.sh',
                      'scripts/qa-8a-worktree.py'},
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
    for repo, baseline in zip(repos, ('b08abd2', '304e237')):
        if git(repo, 'rev-parse', '--short', 'HEAD').strip() != baseline:
            raise RuntimeError(f'{repo.name}: 7H baseline moved')
        if git(repo, 'diff', '--cached', '--name-only'):
            raise RuntimeError(f'{repo.name}: pre-staged changes present')
        files = changed(repo)
        if not files:
            raise RuntimeError(f'{repo.name}: expected 8A changes absent')
        git(repo, 'diff', '--check')
        for file in files:
            print(f'{repo.name}: {file}')
    print('PASS: reviewed 8A changes only')

def checkpoint():
    verify()
    for repo in repos:
        git(repo, 'add', '--', *changed(repo))
    for repo in repos:
        git(repo, 'commit', '-m', 'checkpoint(8A): facility authentication and dashboard')
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
        raise RuntimeError('Usage: qa-8a-worktree.py verify|commit')
except (RuntimeError, subprocess.CalledProcessError) as error:
    print(f'FAIL: {error}', file=sys.stderr)
    sys.exit(1)
