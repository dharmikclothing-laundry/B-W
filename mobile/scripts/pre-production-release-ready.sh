#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MOBILE="$ROOT/mobile"
BACKEND="$ROOT/backend"
REPORT_DIR="$ROOT/reports/milestones"
LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/bw-6u3.XXXXXX")"
REPORT="$REPORT_DIR/6U-3-PRE-PRODUCTION-RELEASE-READY-$(date +%Y%m%d-%H%M%S).md"
PASS=0
FAIL=0
mkdir -p "$REPORT_DIR"
chmod 700 "$LOG_DIR" "$REPORT_DIR"

line() { printf '%s\n' "$*" | tee -a "$REPORT"; }
gate() {
  local title="$1"; shift
  local file="$LOG_DIR/gate-$((PASS+FAIL+1)).log"
  if "$@" >"$file" 2>&1; then
    line "- PASS: $title"
    PASS=$((PASS+1))
  else
    line "- FAIL: $title (private log: $file)"
    FAIL=$((FAIL+1))
  fi
}
stop_if_failed() {
  if (( FAIL > 0 )); then finish; exit 1; fi
}
finish() {
  line ""
  if (( FAIL == 0 )); then line 'ENGINEERING GATES: PASS'; else line 'ENGINEERING GATES: FAIL'; fi
  line "Engineering checks: $PASS passed, $FAIL failed."
  line ""
  line 'PRIVATE RELEASE INPUTS: PENDING'
  line '- Android release keystore'
  line '- Production Android Maps key'
  line '- Apple distribution team/certificates/provisioning'
  line '- Production iOS Maps configuration'
  line '- Development/UAT/Production Firebase files'
  line '- HTTPS UAT API URL'
  line '- HTTPS Production API URL'
  line ""
  line '6U is not fully complete. Signed UAT and Production release builds still require the private inputs.'
  line 'No production Supabase, payment, Maps, or messaging activity was performed by this run.'
  line "Report: $REPORT"
}

printf '# 6U.3 authenticated E2E and engineering release gates\n\nRun: %s\n\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" >"$REPORT"
line '## Safety and readiness'
gate 'local Supabase and mock provider configuration' python3 "$MOBILE/scripts/qa-release-audit.py" local-safety
gate 'reviewed working-tree allowlist and diff integrity' python3 "$MOBILE/scripts/qa-6u3-worktree.py" verify
stop_if_failed

export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
GRADLE="$HOME/.gradle/manual/gradle-9.4.1/bin/gradle"
if [[ ! -x "$GRADLE" ]]; then
  GRADLE="$(find "$HOME/.gradle/wrapper/dists/gradle-9.4.1-bin" -path '*/gradle-9.4.1/bin/gradle' -type f -print -quit 2>/dev/null || true)"
fi
gate 'Android SDK, JDK 17, adb, and local Gradle 9.4.1' bash -c 'test -x "$1/platform-tools/adb" && test -x "$2/bin/java" && test -x "$3" && "$3" --version | grep -q "Gradle 9.4.1"' _ "$ANDROID_HOME" "$JAVA_HOME" "$GRADLE"
gate 'local Supabase readiness' bash -c 'cd "$1" && ./node_modules/.bin/supabase status && ./node_modules/.bin/supabase migration up --local --yes' _ "$BACKEND"
gate 'order idempotency migration and duplicate-key regression' bash -c 'cd "$1" && ./node_modules/.bin/supabase test db --local supabase/tests/6u3_order_idempotency.sql' _ "$BACKEND"
stop_if_failed

line ''
line '## Code and build gates'
gate 'backend full regression' bash -c 'cd "$1" && npm test -- --runInBand --watchman=false' _ "$BACKEND"
gate 'backend build' bash -c 'cd "$1" && npm run build' _ "$BACKEND"
gate 'mobile full regression' bash -c 'cd "$1" && npm test -- --runInBand --watch=false --watchman=false --silent' _ "$MOBILE"
gate 'mobile TypeScript' bash -c 'cd "$1" && ./node_modules/.bin/tsc --noEmit' _ "$MOBILE"
gate 'mobile strict ESLint' bash -c 'cd "$1" && ./node_modules/.bin/eslint . --max-warnings=0' _ "$MOBILE"
gate 'Android debug build' bash -c 'cd "$1/android" && "$2" :app:assembleDebug --offline --no-daemon' _ "$MOBILE" "$GRADLE"
gate 'iOS signed Development build' bash -c 'cd "$1/ios" && xcodebuild -quiet -workspace BrightWhiteMobile.xcworkspace -scheme BrightWhiteMobile -configuration Debug -sdk iphoneos -destination "generic/platform=iOS" -derivedDataPath "$2" DEVELOPMENT_TEAM=97J7DWSN8Y CODE_SIGNING_ALLOWED=YES build && test -f "$2/Build/Products/Debug-iphoneos/BrightWhiteMobile.app/embedded.mobileprovision" && codesign -dv "$2/Build/Products/Debug-iphoneos/BrightWhiteMobile.app"' _ "$MOBILE" "$LOG_DIR/ios-derived"
gate 'source and untracked-file secret scan' python3 "$MOBILE/scripts/qa-release-audit.py" secrets
stop_if_failed

line ''
line '## Authenticated Android journey'
if ! curl -fsS --max-time 3 http://127.0.0.1:3000/v1/health >/dev/null 2>&1; then
  (cd "$BACKEND" && nohup node dist/main.js >"$LOG_DIR/backend-service.log" 2>&1 &)
fi
if ! curl -fsS --max-time 3 http://127.0.0.1:8081/status | rg -q 'packager-status:running'; then
  (cd "$MOBILE" && nohup ./node_modules/.bin/react-native start --port 8081 >"$LOG_DIR/metro-service.log" 2>&1 &)
fi
gate 'local backend and Metro health' bash -c 'for i in {1..30}; do if curl -fsS --max-time 3 http://127.0.0.1:3000/v1/health >/dev/null 2>&1 && curl -fsS --max-time 3 http://127.0.0.1:8081/status | grep -q "packager-status:running"; then exit 0; fi; sleep 2; done; exit 1'
stop_if_failed

if ! "$ANDROID_HOME/platform-tools/adb" devices | rg -q '^emulator-[0-9]+[[:space:]]+device$'; then
  AVD="$($ANDROID_HOME/emulator/emulator -list-avds | head -1)"
  if [[ -n "$AVD" ]]; then nohup "$ANDROID_HOME/emulator/emulator" -avd "$AVD" >"$LOG_DIR/emulator.log" 2>&1 & fi
fi
gate 'booted Android emulator' bash -c 'for i in {1..90}; do if "$1/platform-tools/adb" devices | grep -Eq "^emulator-[0-9]+[[:space:]]+device$" && [[ "$("$1/platform-tools/adb" shell getprop sys.boot_completed | tr -d "\r")" == 1 ]]; then exit 0; fi; sleep 2; done; exit 1' _ "$ANDROID_HOME"
stop_if_failed
gate 'authenticated local OTP, restore, checkout, failure path, history, Back, and crash sweep' python3 "$MOBILE/scripts/qa-authenticated-e2e.py"
stop_if_failed

line ''
line '## Checkpoint'
gate 'reviewed changes before checkpoint' python3 "$MOBILE/scripts/qa-6u3-worktree.py" verify
stop_if_failed
gate 'pre-production-release-ready checkpoint and clean working trees' python3 "$MOBILE/scripts/qa-6u3-worktree.py" commit
if (( FAIL == 0 )); then
  line "Backend checkpoint: $(git -C "$BACKEND" rev-parse --short HEAD)"
  line "Mobile checkpoint: $(git -C "$MOBILE" rev-parse --short HEAD)"
fi
finish
(( FAIL == 0 ))
