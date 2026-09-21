#!/usr/bin/env bash
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKEND="$ROOT/backend"
MOBILE="$ROOT/mobile"
REPORT_DIR="$ROOT/reports/milestones"
LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/bw-9c.XXXXXX")"
REPORT="$REPORT_DIR/9C-ADMIN-STAFF-MANAGEMENT-$(date +%Y%m%d-%H%M%S).md"
PASS=0
FAIL=0
API_PID=''
CHECKPOINT='NOT CREATED'
mkdir -p "$REPORT_DIR"
chmod 700 "$LOG_DIR"
note() { printf '%s\n' "$*" | tee -a "$REPORT"; }
gate() {
  local label="$1" directory="$2"; shift 2
  local output="$LOG_DIR/gate-$((PASS+FAIL+1)).log"
  note "- Command: cd $directory && $*"
  if (cd "$directory" && "$@") >"$output" 2>&1; then
    note "  - PASS: $label"; PASS=$((PASS+1))
    rg '^PASS:' "$output" | sed 's/^/    - /' >>"$REPORT" || true
    return 0
  fi
  note "  - FAIL: $label (private log: $output)"; FAIL=$((FAIL+1))
  rg '^FAIL:' "$output" | sed 's/^/    - /' >>"$REPORT" || true
  return 1
}
finish() {
  note ''
  if (( FAIL == 0 )) && [[ "$CHECKPOINT" == 'CREATED' ]]; then note 'Status: COMPLETE FOR DEVELOPMENT'; else note 'Status: INCOMPLETE'; fi
  note "Engineering / Development gates: $PASS passed, $FAIL failed"
  note 'UAT / Production activation gates: DEFERRED TO PLATFORM UAT'
  if [[ "$CHECKPOINT" == 'CREATED' ]]; then
    note "Backend checkpoint: $(git -C "$BACKEND" rev-parse --short HEAD)"
    note "Mobile checkpoint: $(git -C "$MOBILE" rev-parse --short HEAD)"
  else
    note 'Backend checkpoint: NOT CREATED'
    note 'Mobile checkpoint: NOT CREATED'
  fi
  note 'Production services touched: NO'
  note 'Secrets committed: NO'
  note 'Fictional local 9C staff fixtures: retained disabled with immutable audit history.'
  note "Report: $REPORT"
}
trap 'if [[ -n "$API_PID" ]]; then kill "$API_PID" 2>/dev/null || true; wait "$API_PID" 2>/dev/null || true; fi' EXIT
printf '# 9C Admin Driver and Facility Staff Management\n\nRun: %s\n\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" >"$REPORT"
note 'Scope: Admin provisioning, role and Facility assignment, search/filter, status/workload/history, activation, deactivation, access revocation, reassignment and immutable action audit. No operational-user hard delete.'
note 'Development: local Supabase, fictional local OTP, mock providers and retained disabled staff fixtures only. No Production services.'
note 'UAT / Production activation gates: DEFERRED TO PLATFORM UAT.'
note '## Preflight and safety'
gate 'local/mock provider separation' "$MOBILE" python3 scripts/qa-release-audit.py local-safety
gate 'clean 9B baselines and reviewed 9C files' "$MOBILE" python3 scripts/qa-9c-worktree.py verify
if (( FAIL > 0 )); then finish; exit 1; fi
note '## Changed files'
python3 "$MOBILE/scripts/qa-9c-worktree.py" verify | rg '^(backend|mobile): ' | sed 's/^/- /' >>"$REPORT"
export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
GRADLE="$HOME/.gradle/manual/gradle-9.4.1/bin/gradle"
note '## Engineering gates'
gate 'local Supabase readiness and migrations' "$BACKEND" bash -c './node_modules/.bin/supabase status && ./node_modules/.bin/supabase migration up --local --yes'
gate 'source and untracked-file secret scan' "$MOBILE" python3 scripts/qa-release-audit.py secrets
gate 'runner and fixture syntax' "$ROOT" bash -c 'bash -n bw mobile/scripts/admin-staff-management-milestone.sh && node --check backend/scripts/9c-functional-acceptance.cjs && python3 -c '\''import ast,pathlib; ast.parse(pathlib.Path("mobile/scripts/qa-9c-worktree.py").read_text())'\'''
gate 'backend Admin staff and authentication targeted tests' "$BACKEND" npm test -- --runInBand --watchman=false staff.service.spec.ts auth.service.spec.ts
gate 'backend HTTP Admin RBAC integration' "$BACKEND" npm run test:e2e -- --runInBand --watchman=false
gate 'mobile Admin staff lifecycle screens and API tests' "$MOBILE" npm test -- --runInBand --watch=false --watchman=false --silent adminStaffApi AdminStaffScreen AdminStaffListScreen AdminStaffErrorScreen AdminStaffDetailScreen AdminDashboardScreen
gate 'backend full regression' "$BACKEND" npm test -- --runInBand --watchman=false
gate 'mobile full regression' "$MOBILE" npm test -- --runInBand --watch=false --watchman=false --silent
gate 'backend build' "$BACKEND" npm run build
gate 'backend strict ESLint' "$BACKEND" ./node_modules/.bin/eslint src test --max-warnings=0
gate 'mobile TypeScript' "$MOBILE" ./node_modules/.bin/tsc --noEmit
gate 'mobile strict ESLint' "$MOBILE" ./node_modules/.bin/eslint . --max-warnings=0
gate 'Android Debug build with local Gradle 9.4.1' "$MOBILE/android" "$GRADLE" :app:assembleDebug --offline --no-daemon
gate 'iOS signed Development build' "$MOBILE/ios" bash -c 'xcodebuild -quiet -workspace BrightWhiteMobile.xcworkspace -scheme BrightWhiteMobile -configuration Debug -sdk iphoneos -destination "generic/platform=iOS" -derivedDataPath "$1" DEVELOPMENT_TEAM=97J7DWSN8Y CODE_SIGNING_ALLOWED=YES build && test -f "$1/Build/Products/Debug-iphoneos/BrightWhiteMobile.app/embedded.mobileprovision" && codesign -dv "$1/Build/Products/Debug-iphoneos/BrightWhiteMobile.app"' _ "$LOG_DIR/ios-derived"
note '## Local Admin functional acceptance'
if lsof -tiTCP:3001 -sTCP:LISTEN >/dev/null 2>&1; then
  note '- FAIL: acceptance port 3001 occupied'; FAIL=$((FAIL+1))
else
  (cd "$BACKEND" && exec env PORT=3001 node dist/main.js) >"$LOG_DIR/local-api.log" 2>&1 & API_PID=$!
  gate 'local 9C API health' "$ROOT" bash -c 'for i in {1..30}; do curl -fsS --max-time 2 http://127.0.0.1:3001/v1/health >/dev/null 2>&1 && exit 0; sleep 2; done; exit 1'
  if curl -fsS --max-time 2 http://127.0.0.1:3001/v1/health >/dev/null 2>&1; then
    gate 'fictional Admin provisioning, staff lifecycle, Facility reassignment and audit' "$BACKEND" node scripts/9c-functional-acceptance.cjs
  fi
fi
note '## Final checkpoint'
gate 'final changed-file and diff review' "$MOBILE" python3 scripts/qa-9c-worktree.py verify
if (( FAIL == 0 )); then
  if gate 'checkpoint and clean Git trees' "$MOBILE" python3 scripts/qa-9c-worktree.py commit; then CHECKPOINT='CREATED'; fi
fi
finish
(( FAIL == 0 ))
