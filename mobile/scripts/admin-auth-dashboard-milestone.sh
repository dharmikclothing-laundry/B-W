#!/usr/bin/env bash
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKEND="$ROOT/backend"
MOBILE="$ROOT/mobile"
REPORT_DIR="$ROOT/reports/milestones"
LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/bw-9a.XXXXXX")"
REPORT="$REPORT_DIR/9A-ADMIN-AUTH-RBAC-DASHBOARD-$(date +%Y%m%d-%H%M%S).md"
PASS=0
FAIL=0
API_PID=''
DEVICE_API_PID=''
METRO_PID=''
FIXTURE=0
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
cleanup() {
  if (( FIXTURE == 1 )); then
    (cd "$BACKEND" && node scripts/9a-device-fixture.cjs cleanup) >"$LOG_DIR/fixture-cleanup.log" 2>&1 || true
  fi
  for pid in "$API_PID" "$DEVICE_API_PID" "$METRO_PID"; do
    if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi
  done
}
finish() {
  local status='INCOMPLETE'
  if (( FAIL == 0 )) && [[ "$CHECKPOINT" == 'CREATED' ]]; then status='COMPLETE FOR DEVELOPMENT'; fi
  note ''
  note "Status: $status"
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
  note "Report: $REPORT"
}
trap cleanup EXIT
printf '# 9A Admin Authentication, RBAC and Dashboard\n\nRun: %s\n\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" >"$REPORT"
note 'Scope: privileged existing OTP/Admin role, existing secure session, server-side authorization, existing analytics views and mobile Admin dashboard. No public Admin signup or new staff workflow.'
note 'Development: local Supabase, fictional temporary Admin, local OTP and mock providers only. No Production services.'
note '## UAT / Production activation gates'
note '- DEFERRED TO PLATFORM UAT: private Firebase, Maps, signing, HTTPS API and production provisioning inputs.'
note '## Preflight and safety'
gate 'local/mock provider separation' "$MOBILE" python3 scripts/qa-release-audit.py local-safety
gate 'clean 8G baselines and reviewed 9A files' "$MOBILE" python3 scripts/qa-9a-worktree.py verify
if (( FAIL > 0 )); then finish; exit 1; fi
note '## Changed files'
python3 "$MOBILE/scripts/qa-9a-worktree.py" verify | rg '^(backend|mobile): ' | sed 's/^/- /' >>"$REPORT"
export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
GRADLE="$HOME/.gradle/manual/gradle-9.4.1/bin/gradle"
note '## Engineering gates'
gate 'local Supabase readiness and migrations' "$BACKEND" bash -c './node_modules/.bin/supabase status && ./node_modules/.bin/supabase migration up --local --yes'
gate 'source and untracked-file secret scan' "$MOBILE" python3 scripts/qa-release-audit.py secrets
gate 'runner, fixture, and Android QA syntax' "$ROOT" bash -c 'bash -n bw mobile/scripts/admin-auth-dashboard-milestone.sh && node --check backend/scripts/9a-functional-acceptance.cjs && node --check backend/scripts/9a-device-fixture.cjs && python3 -c '\''import ast,pathlib; [ast.parse(pathlib.Path(p).read_text()) for p in ("mobile/scripts/qa-9a-worktree.py", "mobile/scripts/qa-admin-android.py")]'\'''
gate 'backend Admin auth and analytics targeted tests' "$BACKEND" npm test -- --runInBand --watchman=false auth.service.spec.ts analytics.service.spec.ts staff.service.spec.ts
gate 'backend HTTP Admin RBAC integration' "$BACKEND" npm run test:e2e -- --runInBand --watchman=false
gate 'mobile Admin dashboard, API and secure-session tests' "$MOBILE" npm test -- --runInBand --watch=false --watchman=false --silent AdminDashboardScreen adminDashboardApi driverProfileApi secureSessionStorage sessionManager
gate 'backend full regression' "$BACKEND" npm test -- --runInBand --watchman=false
gate 'mobile full regression' "$MOBILE" npm test -- --runInBand --watch=false --watchman=false --silent
gate 'backend build' "$BACKEND" npm run build
gate 'backend strict ESLint' "$BACKEND" ./node_modules/.bin/eslint src test --max-warnings=0
gate 'mobile TypeScript' "$MOBILE" ./node_modules/.bin/tsc --noEmit
gate 'mobile strict ESLint' "$MOBILE" ./node_modules/.bin/eslint . --max-warnings=0
gate 'Android Debug build with local Gradle 9.4.1' "$MOBILE/android" "$GRADLE" :app:assembleDebug --offline --no-daemon
gate 'iOS signed Development build' "$MOBILE/ios" bash -c 'xcodebuild -quiet -workspace BrightWhiteMobile.xcworkspace -scheme BrightWhiteMobile -configuration Debug -sdk iphoneos -destination "generic/platform=iOS" -derivedDataPath "$1" DEVELOPMENT_TEAM=97J7DWSN8Y CODE_SIGNING_ALLOWED=YES build && test -f "$1/Build/Products/Debug-iphoneos/BrightWhiteMobile.app/embedded.mobileprovision" && codesign -dv "$1/Build/Products/Debug-iphoneos/BrightWhiteMobile.app"' _ "$LOG_DIR/ios-derived"
note '## Local privileged Admin acceptance'
if lsof -tiTCP:3001 -sTCP:LISTEN >/dev/null 2>&1; then
  note '- FAIL: acceptance port 3001 occupied'; FAIL=$((FAIL+1))
else
  (cd "$BACKEND" && exec env PORT=3001 node dist/main.js) >"$LOG_DIR/local-api.log" 2>&1 & API_PID=$!
  gate 'local 9A API health' "$ROOT" bash -c 'for i in {1..30}; do curl -fsS --max-time 2 http://127.0.0.1:3001/v1/health >/dev/null 2>&1 && exit 0; sleep 2; done; exit 1'
  if curl -fsS --max-time 2 http://127.0.0.1:3001/v1/health >/dev/null 2>&1; then
    gate 'fictional Admin OTP, analytics, unauthorized roles, refresh and disabled access' "$BACKEND" node scripts/9a-functional-acceptance.cjs
  fi
fi
note '## Android authenticated emulator acceptance'
if lsof -tiTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  gate 'existing local device API health' "$ROOT" bash -c 'curl -fsS --max-time 2 http://127.0.0.1:3000/v1/health >/dev/null'
else
  (cd "$BACKEND" && exec env PORT=3000 node dist/main.js) >"$LOG_DIR/device-api.log" 2>&1 & DEVICE_API_PID=$!
  gate 'local Android API readiness' "$ROOT" bash -c 'for i in {1..30}; do curl -fsS --max-time 2 http://127.0.0.1:3000/v1/health >/dev/null 2>&1 && exit 0; sleep 2; done; exit 1'
fi
if lsof -tiTCP:8081 -sTCP:LISTEN >/dev/null 2>&1; then
  gate 'existing local Metro readiness' "$ROOT" bash -c 'curl -fsS --max-time 2 http://127.0.0.1:8081/status | rg -q running'
else
  (cd "$MOBILE" && exec ./node_modules/.bin/react-native start --port 8081) >"$LOG_DIR/metro.log" 2>&1 & METRO_PID=$!
  gate 'local Metro readiness' "$ROOT" bash -c 'for i in {1..45}; do curl -fsS --max-time 2 http://127.0.0.1:8081/status 2>/dev/null | rg -q running && exit 0; sleep 2; done; exit 1'
fi
gate 'booted Android emulator and local app transport' "$ROOT" bash -c 'adb devices | rg -q "^emulator-[0-9]+[[:space:]]+device$" && adb reverse tcp:3000 tcp:3000 && adb reverse tcp:8081 tcp:8081'
if curl -fsS --max-time 2 http://127.0.0.1:3000/v1/health >/dev/null 2>&1; then
  if gate 'fictional privileged Admin device fixture prepared' "$BACKEND" node scripts/9a-device-fixture.cjs prepare; then
    FIXTURE=1
    gate 'authenticated Admin Android login, restore, dashboard, refresh, logout and fatal-log sweep' "$MOBILE" python3 scripts/qa-admin-android.py
    if gate 'fictional Admin fixture removed' "$BACKEND" node scripts/9a-device-fixture.cjs cleanup; then FIXTURE=0; fi
  fi
fi
note '## Final checkpoint'
gate 'final changed-file and diff review' "$MOBILE" python3 scripts/qa-9a-worktree.py verify
if (( FAIL == 0 )); then
  if gate 'checkpoint and clean Git trees' "$MOBILE" python3 scripts/qa-9a-worktree.py commit; then CHECKPOINT='CREATED'; fi
fi
finish
(( FAIL == 0 ))
