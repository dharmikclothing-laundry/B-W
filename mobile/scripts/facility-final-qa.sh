#!/usr/bin/env bash
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKEND="$ROOT/backend"
MOBILE="$ROOT/mobile"
REPORT_DIR="$ROOT/reports/milestones"
LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/bw-8g.XXXXXX")"
REPORT="$REPORT_DIR/8G-FACILITY-FINAL-QA-$(date +%Y%m%d-%H%M%S).md"
PASS=0
FAIL=0
API_PID=''
DEVICE_API_PID=''
METRO_PID=''
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
  (cd "$BACKEND" && node scripts/8g-device-fixture.cjs cleanup) >"$LOG_DIR/fixture-cleanup.log" 2>&1 || true
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
printf '# 8G Facility Final QA\n\nRun: %s\n\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" >"$REPORT"
note 'Scope: authenticated Facility login, session restore/logout, queues, secure QR intake, garment verification, discrepancies, Manager reconciliation, processing, QC/rewash, packing and readiness.'
note 'Development uses local Supabase, fictional accounts/orders, local OTP and mock providers only. Production services are prohibited.'
note '## UAT / Production activation gates'
note '- DEFERRED TO PLATFORM UAT: private Firebase, release signing, production Maps and API inputs.'
note '## Preflight and safety'
gate 'local/mock providers only' "$MOBILE" python3 scripts/qa-release-audit.py local-safety
gate 'clean 8F baselines and reviewed 8G files only' "$MOBILE" python3 scripts/qa-8g-worktree.py verify
if (( FAIL > 0 )); then finish; exit 1; fi
note '## Changed files'
python3 "$MOBILE/scripts/qa-8g-worktree.py" verify | rg '^(backend|mobile): ' | sed 's/^/- /' >>"$REPORT"
export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
GRADLE="$HOME/.gradle/manual/gradle-9.4.1/bin/gradle"
if [[ ! -x "$GRADLE" ]]; then
  GRADLE="$(find "$HOME/.gradle/wrapper/dists/gradle-9.4.1-bin" -path '*/gradle-9.4.1/bin/gradle' -type f -print -quit 2>/dev/null || true)"
fi
note '## Engineering gates'
gate 'local Supabase readiness and migrations' "$BACKEND" bash -c './node_modules/.bin/supabase status && ./node_modules/.bin/supabase migration up --local --yes'
gate 'source and untracked-file secret scan' "$MOBILE" python3 scripts/qa-release-audit.py secrets
gate '8G runner and acceptance syntax' "$ROOT" bash -c 'bash -n bw mobile/scripts/facility-final-qa.sh && python3 -c '\''import ast,pathlib; [ast.parse(pathlib.Path(p).read_text()) for p in ("mobile/scripts/qa-8g-worktree.py", "mobile/scripts/qa-facility-android.py", "mobile/scripts/qa-8g-ios-device.py")]'\'' && node --check backend/scripts/8g-device-fixture.cjs'
gate 'backend Facility, RBAC, QR, intake, processing, QC and packing targeted regression' "$BACKEND" npm test -- --runInBand --watchman=false facility.service.spec.ts facility.dashboard.spec.ts facility.intake.spec.ts facility.verification.spec.ts facility.packing.spec.ts auth.service.spec.ts
gate 'mobile Facility UI, API, session and error-state regression' "$MOBILE" npm test -- --runInBand --watch=false --watchman=false --silent FacilityDashboardScreen FacilityIntakeScreen FacilityVerificationScreen FacilityProcessingPanel FacilityPackingPanel facilityDashboardApi facilityIntakeApi facilityVerificationApi facilityProcessingApi facilityPackingApi secureSessionStorage
if lsof -tiTCP:3001 -sTCP:LISTEN >/dev/null 2>&1; then
  note '- FAIL: local acceptance port 3001 occupied'; FAIL=$((FAIL+1))
else
  if [[ -f "$BACKEND/dist/main.js" ]]; then
    (cd "$BACKEND" && exec env PORT=3001 node dist/main.js) >"$LOG_DIR/local-api.log" 2>&1 & API_PID=$!
    gate 'local 8G acceptance API health' "$ROOT" bash -c 'for i in {1..30}; do curl -fsS --max-time 2 http://127.0.0.1:3001/v1/health >/dev/null 2>&1 && exit 0; sleep 2; done; exit 1'
    if curl -fsS --max-time 2 http://127.0.0.1:3001/v1/health >/dev/null 2>&1; then
      gate 'Facility Staff/Manager local OTP, self-scoped dashboard, disabled access and role enforcement' "$BACKEND" node scripts/8a-functional-acceptance.cjs
    fi
  else
    note '- FAIL: backend build missing before authenticated acceptance'; FAIL=$((FAIL+1))
  fi
fi
gate 'backend full regression' "$BACKEND" npm test -- --runInBand --watchman=false
gate 'mobile full regression' "$MOBILE" npm test -- --runInBand --watch=false --watchman=false --silent
gate 'backend build' "$BACKEND" npm run build
gate 'backend strict ESLint' "$BACKEND" ./node_modules/.bin/eslint src test --max-warnings=0
gate 'mobile TypeScript' "$MOBILE" ./node_modules/.bin/tsc --noEmit
gate 'mobile strict ESLint' "$MOBILE" ./node_modules/.bin/eslint . --max-warnings=0
gate 'Android Debug build with local Gradle 9.4.1' "$MOBILE/android" "$GRADLE" :app:assembleDebug --offline --no-daemon
gate 'iOS signed Development build' "$MOBILE/ios" bash -c 'xcodebuild -quiet -workspace BrightWhiteMobile.xcworkspace -scheme BrightWhiteMobile -configuration Debug -sdk iphoneos -destination "generic/platform=iOS" -derivedDataPath "$1" DEVELOPMENT_TEAM=97J7DWSN8Y CODE_SIGNING_ALLOWED=YES build && test -f "$1/Build/Products/Debug-iphoneos/BrightWhiteMobile.app/embedded.mobileprovision" && codesign -dv "$1/Build/Products/Debug-iphoneos/BrightWhiteMobile.app"' _ "$LOG_DIR/ios-derived"
note '## End-to-end local Facility lifecycle'
if curl -fsS --max-time 2 http://127.0.0.1:3001/v1/health >/dev/null 2>&1; then
  gate 'fictional QR receiving through readiness, isolation, Staff/Manager roles, duplicate and invalid actions' "$BACKEND" env BW_8F_ACCEPTANCE=1 node scripts/7f-functional-acceptance.cjs
else
  note '- FAIL: authenticated Facility lifecycle could not run without local API'; FAIL=$((FAIL+1))
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
gate 'booted emulator and local app transport' "$ROOT" bash -c 'adb devices | rg -q "^emulator-[0-9]+[[:space:]]+device$" && adb reverse tcp:3000 tcp:3000 && adb reverse tcp:8081 tcp:8081'
if curl -fsS --max-time 2 http://127.0.0.1:3000/v1/health >/dev/null 2>&1; then
  if gate 'fictional local Facility Staff device fixture prepared' "$BACKEND" node scripts/8g-device-fixture.cjs prepare; then
    gate 'authenticated Android Facility login, restore, intake navigation, Back, refresh, logout and fatal-log sweep' "$MOBILE" python3 scripts/qa-facility-android.py
    gate 'fictional Facility Staff activation restored' "$BACKEND" node scripts/8g-device-fixture.cjs cleanup
  fi
fi
note '## iOS physical Development acceptance'
gate 'authenticated physical iPhone Facility journey and fatal-log evidence' "$MOBILE" python3 scripts/qa-8g-ios-device.py
note '## Final checkpoint'
gate 'final changed-file and diff review' "$MOBILE" python3 scripts/qa-8g-worktree.py verify
if (( FAIL == 0 )); then
  if gate 'checkpoint and clean Git trees' "$MOBILE" python3 scripts/qa-8g-worktree.py commit; then CHECKPOINT='CREATED'; fi
fi
finish
(( FAIL == 0 ))
