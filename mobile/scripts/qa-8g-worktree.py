#!/usr/bin/env python3
"""Review 8G-only changes and checkpoint both repos after zero failed gates."""
import pathlib
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parents[2]
repos = {
    root / 'backend': ('f02e42d', {'scripts/8g-device-fixture.cjs'}),
    root / 'mobile': ('6e6d490', {'scripts/facility-final-qa.sh', 'scripts/qa-8g-worktree.py',
                                   'scripts/qa-facility-android.py', 'scripts/qa-8g-ios-device.py'}),
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
            raise RuntimeError(f'{repo.name}: unrelated or unexpected change {entry[3:]}')
        files.append(entry[3:])
    return files


def verify():
    for repo, (baseline, allowed) in repos.items():
        if git(repo, 'rev-parse', '--short', 'HEAD').strip() != baseline:
            raise RuntimeError(f'{repo.name}: 8F baseline moved')
        if git(repo, 'diff', '--cached', '--name-only'):
            raise RuntimeError(f'{repo.name}: pre-staged changes present')
        files = changed(repo, allowed)
        if not files:
            raise RuntimeError(f'{repo.name}: expected 8G changes absent')
        git(repo, 'diff', '--check')
        for file in files:
            print(f'{repo.name}: {file}')
    print('PASS: clean 8F baselines and reviewed 8G changes only')


def checkpoint():
    verify()
    for repo, (_, allowed) in repos.items():
        git(repo, 'add', '--', *changed(repo, allowed))
    for repo in repos:
        git(repo, 'commit', '-m', 'checkpoint(8G): facility final QA')
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
        raise RuntimeError('Usage: qa-8g-worktree.py verify|commit')
except (RuntimeError, subprocess.CalledProcessError) as error:
    print(f'FAIL: {error}', file=sys.stderr)
    sys.exit(1)
