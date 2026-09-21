#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKEND="$ROOT/backend"
MOBILE="$ROOT/mobile"
REPORT_DIR="$ROOT/reports/milestones"
LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/bw-7g.XXXXXX")"
REPORT="$REPORT_DIR/7G-DELIVERY-OTP-PHOTO-PROOF-$(date +%Y%m%d-%H%M%S).md"
PASS=0
FAIL=0
API_PID=''
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
    if [[ "$label" == 'authenticated local 7G delivery acceptance' ]]; then
      rg '^PASS:' "$output" | sed 's/^/    - /' >>"$REPORT" || true
    fi
  else
    note "  - FAIL: $label (private log: $output)"
    FAIL=$((FAIL+1))
    rg '^FAIL:' "$output" | sed 's/^/    - /' >>"$REPORT" || true
  fi
}
finish() {
  local status='INCOMPLETE'
  if [[ "$FAIL" -eq 0 && "$CHECKPOINT" == 'CREATED' ]]; then status='COMPLETE'; fi
  note ''
  note "Status: $status"
  note "Automated gates: $PASS passed, $FAIL failed"
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
cleanup() {
  if [[ -n "$API_PID" ]]; then kill "$API_PID" 2>/dev/null || true; wait "$API_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT

printf '# 7G Delivery OTP and Photo Proof\n\nRun: %s\n\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" >"$REPORT"
note 'Contract: existing facility processing, delivery assignment, local OTP, signed proof upload, and complete_delivery_atomic. No new procedure or direct order-status write.'
note 'The atomic procedure records delivered_at and advances the visible order state through delivered to claim_period_active. Development/UAT uses local Supabase, local OTP, local Storage, and mock Maps/payment providers.'
note '## Preflight and safety'
gate 'local/mock providers only' "$MOBILE" python3 scripts/qa-release-audit.py local-safety
gate '7F baselines and reviewed 7G changes only' "$MOBILE" python3 scripts/qa-7g-worktree.py verify
if (( FAIL > 0 )); then finish; exit 1; fi
note ''
note '## Changed files'
python3 "$MOBILE/scripts/qa-7g-worktree.py" verify | rg '^(backend|mobile): ' | sed 's/^/- /' >>"$REPORT"

export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
GRADLE="$HOME/.gradle/manual/gradle-9.4.1/bin/gradle"
if [[ ! -x "$GRADLE" ]]; then
  GRADLE="$(find "$HOME/.gradle/wrapper/dists/gradle-9.4.1-bin" -path '*/gradle-9.4.1/bin/gradle' -type f -print -quit 2>/dev/null || true)"
fi

note ''
note '## Local safety and regression'
gate 'local Supabase readiness' "$BACKEND" bash -c './node_modules/.bin/supabase status && ./node_modules/.bin/supabase migration up --local --yes'
gate 'source and untracked-file secret scan' "$MOBILE" python3 scripts/qa-release-audit.py secrets
gate 'runner and acceptance syntax' "$ROOT" bash -c 'bash -n bw mobile/scripts/driver-delivery-milestone.sh && node --check backend/scripts/7g-functional-acceptance.cjs'
gate 'backend delivery, OTP, assignment and tracking tests' "$BACKEND" npm test -- --runInBand --watchman=false delivery.service.spec.ts otp.service.spec.ts logistics.service.spec.ts
gate 'mobile delivery OTP, photo and Driver screen tests' "$MOBILE" npm test -- --runInBand --watch=false --watchman=false --silent driverDeliveryApi DriverJobDetailScreen
gate 'backend full regression' "$BACKEND" npm test -- --runInBand --watchman=false
gate 'mobile full regression' "$MOBILE" npm test -- --runInBand --watch=false --watchman=false --silent
gate 'backend build' "$BACKEND" npm run build
gate 'backend strict ESLint' "$BACKEND" ./node_modules/.bin/eslint src test --max-warnings=0
gate 'mobile TypeScript' "$MOBILE" ./node_modules/.bin/tsc --noEmit
gate 'mobile strict ESLint' "$MOBILE" ./node_modules/.bin/eslint . --max-warnings=0
gate 'Android debug build with local Gradle 9.4.1' "$MOBILE/android" "$GRADLE" :app:assembleDebug --offline --no-daemon
gate 'iOS signed Development build' "$MOBILE/ios" bash -c 'xcodebuild -quiet -workspace BrightWhiteMobile.xcworkspace -scheme BrightWhiteMobile -configuration Debug -sdk iphoneos -destination "generic/platform=iOS" -derivedDataPath "$1" DEVELOPMENT_TEAM=97J7DWSN8Y CODE_SIGNING_ALLOWED=YES build && test -f "$1/Build/Products/Debug-iphoneos/BrightWhiteMobile.app/embedded.mobileprovision" && codesign -dv "$1/Build/Products/Debug-iphoneos/BrightWhiteMobile.app"' _ "$LOG_DIR/ios-derived"

if (( FAIL == 0 )); then
  note ''
  note '## Authenticated functional acceptance'
  if lsof -tiTCP:3001 -sTCP:LISTEN >/dev/null 2>&1; then
    note '- FAIL: local acceptance port 3001 is occupied'
    FAIL=$((FAIL+1))
  else
    (cd "$BACKEND" && exec env PORT=3001 node dist/main.js) >"$LOG_DIR/local-api.log" 2>&1 &
    API_PID=$!
    gate 'local 7G API health' "$ROOT" bash -c 'for i in {1..30}; do curl -fsS --max-time 2 http://127.0.0.1:3001/v1/health >/dev/null 2>&1 && exit 0; sleep 2; done; exit 1'
    if (( FAIL == 0 )); then
      gate 'authenticated local 7G delivery acceptance' "$BACKEND" node scripts/7g-functional-acceptance.cjs
    fi
  fi
fi

if (( FAIL == 0 )); then
  note ''
  note '## Final checkpoint'
  gate 'final changed-file and diff review' "$MOBILE" python3 scripts/qa-7g-worktree.py verify
  if (( FAIL == 0 )); then
    gate 'checkpoint and clean Git trees' "$MOBILE" python3 scripts/qa-7g-worktree.py commit
    if (( FAIL == 0 )); then CHECKPOINT='CREATED'; fi
  fi
fi
finish
(( FAIL == 0 ))
