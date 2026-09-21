#!/usr/bin/env bash
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKEND="$ROOT/backend"
MOBILE="$ROOT/mobile"
REPORT_DIR="$ROOT/reports/milestones"
LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/bw-7h.XXXXXX")"
REPORT="$REPORT_DIR/7H-DRIVER-FINAL-QA-$(date +%Y%m%d-%H%M%S).md"
PASS=0
FAIL=0
API_PID=''
DEVICE_API_PID=''
METRO_PID=''
FIXTURE=0
NOTIFICATION_FIXTURE=0
CHECKPOINT='NOT CREATED'
mkdir -p "$REPORT_DIR"
chmod 700 "$LOG_DIR" "$REPORT_DIR"
note() { printf '%s\n' "$*" | tee -a "$REPORT"; }
gate() {
  local label="$1" directory="$2"; shift 2
  local output="$LOG_DIR/gate-$((PASS+FAIL+1)).log"
  note "- Command: cd $directory && $*"
  if (cd "$directory" && "$@") >"$output" 2>&1; then
    note "  - PASS: $label"
    PASS=$((PASS+1))
    rg '^PASS:' "$output" | sed 's/^/    - /' >>"$REPORT" || true
    return 0
  fi
  note "  - FAIL: $label (private log: $output)"
  FAIL=$((FAIL+1))
  rg '^FAIL:' "$output" | sed 's/^/    - /' >>"$REPORT" || true
  return 1
}
finish() {
  local status='INCOMPLETE'
  if [[ "$FAIL" -eq 0 && "$CHECKPOINT" == 'CREATED' ]]; then status='COMPLETE FOR DEVELOPMENT'; fi
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
  note 'Production Firebase: NOT USED'
  note 'UAT/Production Firebase: DEFERRED'
  note 'Secrets committed: NO'
  if [[ "$CHECKPOINT" == 'CREATED' ]]; then
    note 'Driver notifications/deep links: PASS using mock/local Development flow'
    note 'Android Driver QA: PASS'
    note 'iPhone Driver QA: PASS'
    note 'Next milestone permitted: 8A'
  else
    note 'Next milestone permitted: DO NOT PROCEED'
  fi
  note "Report: $REPORT"
}
cleanup() {
  if (( NOTIFICATION_FIXTURE == 1 )); then
    (cd "$BACKEND" && node scripts/7h-notification-fixture.cjs cleanup) >"$LOG_DIR/notification-cleanup.log" 2>&1 || true
  fi
  if (( FIXTURE == 1 )); then
    (cd "$BACKEND" && node scripts/7d-device-fixture.cjs cleanup) >"$LOG_DIR/fixture-cleanup.log" 2>&1 || true
  fi
  for pid in "$API_PID" "$DEVICE_API_PID" "$METRO_PID"; do
    if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi
  done
}
trap cleanup EXIT
printf '# 7H Driver Final QA and Release Hardening\n\nRun: %s\n\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" >"$REPORT"
note 'Scope: full Driver regression, authenticated local/mock journeys, device QA, crash and security checks, and release readiness. Existing backend contracts only.'
note 'Development/UAT: local Supabase and fictional accounts, local OTP, local Storage, and mock Maps/payment providers. Production activity prohibited.'
note '## UAT / Production activation gates'
note '- DEFERRED TO PLATFORM UAT: Android release signing, private Firebase, and Maps key; no release build or Production provider invoked.'
note '- DEFERRED TO PLATFORM UAT: iOS Release Firebase, distribution signing, and Maps configuration; no release build or Production provider invoked.'
note '## Preflight and safety'
gate 'local/mock providers only' "$MOBILE" python3 scripts/qa-release-audit.py local-safety
gate '7G baselines and reviewed 7H changes only' "$MOBILE" python3 scripts/qa-7h-worktree.py verify
if (( FAIL > 0 )); then finish; exit 1; fi
note ''
note '## Changed files'
python3 "$MOBILE/scripts/qa-7h-worktree.py" verify | rg '^(backend|mobile): ' | sed 's/^/- /' >>"$REPORT"
export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
GRADLE="$HOME/.gradle/manual/gradle-9.4.1/bin/gradle"
if [[ ! -x "$GRADLE" ]]; then
  GRADLE="$(find "$HOME/.gradle/wrapper/dists/gradle-9.4.1-bin" -path '*/gradle-9.4.1/bin/gradle' -type f -print -quit 2>/dev/null || true)"
fi
note ''
note '## Engineering gates'
gate 'local Supabase readiness' "$BACKEND" bash -c './node_modules/.bin/supabase status && ./node_modules/.bin/supabase migration up --local --yes'
gate 'source and untracked-file secret scan' "$MOBILE" python3 scripts/qa-release-audit.py secrets
gate '7H runner, Python and acceptance syntax' "$ROOT" bash -c 'bash -n bw mobile/scripts/driver-final-qa.sh && python3 -c '\''import ast, pathlib; [ast.parse(pathlib.Path(p).read_text()) for p in ("mobile/scripts/qa-7h-worktree.py", "mobile/scripts/qa-7h-ios-device.py", "mobile/scripts/qa-driver-android.py")]'\'' && node --check backend/scripts/7h-functional-acceptance.cjs && node --check backend/scripts/7h-notification-fixture.cjs'
gate 'backend Driver and notification ownership targeted tests' "$BACKEND" npm test -- --runInBand --watchman=false auth.service.spec.ts driver-assignments.service.spec.ts logistics.service.spec.ts otp.service.spec.ts delivery.service.spec.ts notifications.service.spec.ts
gate 'mobile Driver, notification routing and secure storage tests' "$MOBILE" npm test -- --runInBand --watch=false --watchman=false --silent DriverJobDetailScreen DriverDashboardScreen DriverNotificationsScreen driverNotifications driverDeliveryApi secureSessionStorage
gate 'backend full regression' "$BACKEND" npm test -- --runInBand --watchman=false
gate 'mobile full regression' "$MOBILE" npm test -- --runInBand --watch=false --watchman=false --silent
gate 'backend build' "$BACKEND" npm run build
gate 'backend strict ESLint' "$BACKEND" ./node_modules/.bin/eslint src test --max-warnings=0
gate 'mobile TypeScript' "$MOBILE" ./node_modules/.bin/tsc --noEmit
gate 'mobile strict ESLint' "$MOBILE" ./node_modules/.bin/eslint . --max-warnings=0
gate 'Android debug build with local Gradle 9.4.1' "$MOBILE/android" "$GRADLE" :app:assembleDebug --offline --no-daemon
gate 'iOS signed Development build' "$MOBILE/ios" bash -c 'xcodebuild -quiet -workspace BrightWhiteMobile.xcworkspace -scheme BrightWhiteMobile -configuration Debug -sdk iphoneos -destination "generic/platform=iOS" -derivedDataPath "$1" DEVELOPMENT_TEAM=97J7DWSN8Y CODE_SIGNING_ALLOWED=YES build && test -f "$1/Build/Products/Debug-iphoneos/BrightWhiteMobile.app/embedded.mobileprovision" && codesign -dv "$1/Build/Products/Debug-iphoneos/BrightWhiteMobile.app"' _ "$LOG_DIR/ios-debug-derived"
gate 'prior physical Android and iOS background GPS evidence' "$MOBILE" python3 scripts/qa-7d-device-acceptance.py
note ''
note '## Authenticated functional acceptance'
if lsof -tiTCP:3001 -sTCP:LISTEN >/dev/null 2>&1; then
  note '- FAIL: local acceptance port 3001 is occupied'; FAIL=$((FAIL+1))
else
  (cd "$BACKEND" && exec env PORT=3001 node dist/main.js) >"$LOG_DIR/local-api.log" 2>&1 &
  API_PID=$!
  gate 'local 7H API health' "$ROOT" bash -c 'for i in {1..30}; do curl -fsS --max-time 2 http://127.0.0.1:3001/v1/health >/dev/null 2>&1 && exit 0; sleep 2; done; exit 1'
  if curl -fsS --max-time 2 http://127.0.0.1:3001/v1/health >/dev/null 2>&1; then
    gate 'authenticated local Driver lifecycle, security and race acceptance' "$BACKEND" node scripts/7h-functional-acceptance.cjs
  fi
fi
note ''
note '## Android authenticated emulator acceptance'
if lsof -tiTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  gate 'existing local API on port 3000' "$ROOT" bash -c 'curl -fsS --max-time 2 http://127.0.0.1:3000/v1/health >/dev/null'
else
  (cd "$BACKEND" && exec env PORT=3000 node dist/main.js) >"$LOG_DIR/device-api.log" 2>&1 &
  DEVICE_API_PID=$!
  gate 'local device API health' "$ROOT" bash -c 'for i in {1..30}; do curl -fsS --max-time 2 http://127.0.0.1:3000/v1/health >/dev/null 2>&1 && exit 0; sleep 2; done; exit 1'
fi
if lsof -tiTCP:8081 -sTCP:LISTEN >/dev/null 2>&1; then
  gate 'existing local Metro on port 8081' "$ROOT" bash -c 'curl -fsS --max-time 2 http://127.0.0.1:8081/status | rg -q running'
else
  (cd "$MOBILE" && exec ./node_modules/.bin/react-native start --port 8081) >"$LOG_DIR/metro.log" 2>&1 &
  METRO_PID=$!
  gate 'local Metro readiness' "$ROOT" bash -c 'for i in {1..45}; do curl -fsS --max-time 2 http://127.0.0.1:8081/status 2>/dev/null | rg -q running && exit 0; sleep 2; done; exit 1'
fi
gate 'booted Android emulator and local app transport' "$ROOT" bash -c 'adb devices | rg -q "^emulator-[0-9]+[[:space:]]+device$" && adb reverse tcp:3000 tcp:3000 && adb reverse tcp:8081 tcp:8081'
if curl -fsS --max-time 2 http://127.0.0.1:3000/v1/health >/dev/null 2>&1; then
  if gate 'fictional local Driver assignment fixture prepared' "$BACKEND" node scripts/7d-device-fixture.cjs prepare; then
    FIXTURE=1
    if gate 'fictional local Driver notification fixture prepared, no push' "$BACKEND" node scripts/7h-notification-fixture.cjs prepare; then
      NOTIFICATION_FIXTURE=1
      gate 'authenticated Android Driver notification journey, session restore, Back and crash sweep' "$MOBILE" python3 scripts/qa-driver-android.py
      if gate 'fictional local Driver notification fixture cleanup' "$BACKEND" node scripts/7h-notification-fixture.cjs cleanup; then NOTIFICATION_FIXTURE=0; fi
    fi
    if gate 'fictional local Driver fixture cleanup' "$BACKEND" node scripts/7d-device-fixture.cjs cleanup; then FIXTURE=0; fi
  fi
fi
note ''
note '## iOS physical Development acceptance'
gate 'authenticated physical iPhone Driver journey evidence' "$MOBILE" python3 scripts/qa-7h-ios-device.py
note ''
note '## Final checkpoint'
gate 'final changed-file and diff review' "$MOBILE" python3 scripts/qa-7h-worktree.py verify
if (( FAIL == 0 )); then
  if gate 'checkpoint and clean Git trees' "$MOBILE" python3 scripts/qa-7h-worktree.py commit; then CHECKPOINT='CREATED'; fi
fi
finish
(( FAIL == 0 ))
