#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MOBILE="$ROOT/mobile"
BACKEND="$ROOT/backend"
REPORT_DIR="$ROOT/reports/milestones"
STAMP="$(date +%Y%m%d-%H%M%S)"
REPORT="$REPORT_DIR/6L-ANDROID-$STAMP.md"
LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/bw-android.XXXXXX")"
chmod 700 "$LOG_DIR"
PASS=0
FAIL=0
STARTED_BACKEND='no'
STARTED_METRO='no'
CHECKPOINT='not created'
mkdir -p "$REPORT_DIR"
chmod 700 "$REPORT_DIR"

if [[ "${1:-}" == 'map-check' ]]; then
  SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
  ADB="$SDK/platform-tools/adb"
  DEVICE="$($ADB devices | awk '$2 == "device" && $1 ~ /^emulator-/ {print $1; exit}')"
  [[ -n "$DEVICE" ]] || { echo 'No running emulator'; exit 1; }
  PID="$($ADB -s "$DEVICE" shell pidof com.brightwhitemobile | tr -d '\r')"
  [[ -n "$PID" ]] || { echo 'B&W app is not running'; exit 1; }
  MAP_REPORT="$REPORT_DIR/6L-ANDROID-MAP-$STAMP.md"
  "$ADB" -s "$DEVICE" logcat -d --pid="$PID" >"$LOG_DIR/map.log"
  "$ADB" -s "$DEVICE" shell uiautomator dump /sdcard/bw-map-window.xml >/dev/null 2>&1 || true
  "$ADB" -s "$DEVICE" shell cat /sdcard/bw-map-window.xml >"$LOG_DIR/window.xml" 2>/dev/null || true
  {
    echo '# B&W Android Maps screen diagnosis'
    echo
    echo "Run: $(date '+%Y-%m-%d %H:%M:%S %Z')"
    echo
    if rg -qi 'Development map' "$LOG_DIR/window.xml"; then
      if rg -qi 'Google Maps Android API|AirMapRenderer|MapsInitializer' "$LOG_DIR/map.log"; then
        echo '- FAIL: Google Maps SDK initialized while the development mock map is visible.'
        RESULT=1
      else
        echo '- PASS: local development map visible; no Google Maps SDK initialization.'
        RESULT=0
      fi
    elif rg -qi 'Authorization failure|API key not found|API key invalid' "$LOG_DIR/map.log"; then
      echo '- FAIL: Google Maps SDK authorization failure.'
      RESULT=1
    elif rg -qi 'Google Maps Android API|AirMapRenderer|MapsInitializer' "$LOG_DIR/map.log"; then
      echo '- PASS: Maps initialized with no authorization failure observed.'
      RESULT=0
    else
      echo '- PENDING: map screen has not been observed.'
      RESULT=2
    fi
    if rg -qi 'renderer version\(legacy\)|Init with renderer: LEGACY' "$LOG_DIR/map.log"; then
      echo '- Renderer: legacy loaded.'
    elif rg -qi 'renderer version\(latest\)|Init with renderer: LATEST' "$LOG_DIR/map.log"; then
      echo '- Renderer: latest loaded.'
    else
      echo '- Renderer: not confirmed.'
    fi
    echo '- API key and raw log lines were excluded.'
  } >"$MAP_REPORT"
  cat "$MAP_REPORT"
  echo "Report: $MAP_REPORT"
  exit "$RESULT"
fi

cleanup() {
  if [[ "$FAIL" -gt 0 ]]; then
    echo "Automated gates failed; no checkpoint created. Report: $REPORT"
  fi
}
trap cleanup EXIT

note() { printf '%s\n' "$*" | tee -a "$REPORT"; }
check() {
  local name="$1"; shift
  local log="$LOG_DIR/check.log"
  if "$@" >"$log" 2>&1; then
    note "- PASS: $name"
    PASS=$((PASS+1))
    return 0
  fi
  note "- FAIL: $name (details kept in private temporary log)"
  FAIL=$((FAIL+1))
  return 1
}
require() { check "$@" || return 1; }

printf '# B&W Android 6L milestone\n\nRun: %s\n\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" > "$REPORT"
note '## Environment and services'

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
[[ -d "$SDK" ]] || { note '- FAIL: Android SDK directory missing'; exit 1; }
ADB="$SDK/platform-tools/adb"
EMULATOR="$SDK/emulator/emulator"
AVDMANAGER="$SDK/cmdline-tools/latest/bin/avdmanager"
SDKMANAGER="$SDK/cmdline-tools/latest/bin/sdkmanager"
for tool in "$ADB" "$EMULATOR" "$AVDMANAGER" "$SDKMANAGER"; do
  [[ -x "$tool" ]] || { note "- FAIL: missing Android tool $(basename "$tool")"; exit 1; }
done
note '- PASS: Android SDK, adb, emulator and SDK tools present'

if [[ -z "${JAVA_HOME:-}" ]]; then
  for candidate in /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home; do
    if [[ -x "$candidate/bin/java" ]]; then export JAVA_HOME="$candidate"; break; fi
  done
fi
[[ -n "${JAVA_HOME:-}" && -x "$JAVA_HOME/bin/java" ]] || { note '- FAIL: JDK missing'; exit 1; }
require 'JDK' "$JAVA_HOME/bin/java" -version
export ANDROID_HOME="$SDK" ANDROID_SDK_ROOT="$SDK"
export PATH="$JAVA_HOME/bin:$SDK/platform-tools:$SDK/emulator:$PATH"

GRADLE="$HOME/.gradle/manual/gradle-9.4.1/bin/gradle"
if [[ ! -x "$GRADLE" ]]; then
  GRADLE="$(find "$HOME/.gradle/wrapper/dists/gradle-9.4.1-bin" -path '*/gradle-9.4.1/bin/gradle' -type f -print -quit 2>/dev/null || true)"
fi
[[ -n "$GRADLE" && -x "$GRADLE" ]] || { note '- FAIL: downloaded Gradle 9.4.1 missing'; exit 1; }
require 'local Gradle 9.4.1' bash -c '"$1" --version | grep -q "Gradle 9.4.1"' _ "$GRADLE"

PROPS="$MOBILE/android/local.properties"
[[ -f "$PROPS" ]] || { note '- FAIL: android/local.properties missing'; exit 1; }
if ! python3 - "$PROPS" "$SDK" <<'PY' >"$LOG_DIR/check.log" 2>&1
import pathlib, sys
values = {}
for line in pathlib.Path(sys.argv[1]).read_text().splitlines():
    if not line.strip() or line.lstrip().startswith('#'): continue
    key, sep, value = line.partition('=')
    if sep: values[key.strip()] = value.strip()
assert values.get('sdk.dir'), 'sdk.dir missing'
assert pathlib.Path(values['sdk.dir']).is_dir(), 'sdk.dir invalid'
assert values.get('GOOGLE_MAPS_ANDROID_API_KEY'), 'Maps key missing'
PY
then note '- FAIL: local.properties is missing a valid sdk.dir or Maps key'; exit 1; fi
note '- PASS: local.properties has a valid SDK path and nonempty Maps key (values hidden)'

if ! rg -q 'applicationId "com.brightwhitemobile"' "$MOBILE/android/app/build.gradle"; then
  note '- FAIL: Android application ID differs from com.brightwhitemobile'; exit 1
fi
note '- PASS: package com.brightwhitemobile'

# Never launch an API configured for a remote database. Existing processes must pass local health checks.
local_backend_config() {
  python3 - "$BACKEND/.env" <<'PY'
import pathlib, sys, urllib.parse
p = pathlib.Path(sys.argv[1])
if not p.is_file(): sys.exit(1)
v = {}
for line in p.read_text().splitlines():
    if not line or line.lstrip().startswith('#'): continue
    k, sep, val = line.partition('=')
    if sep: v[k.strip()] = val.strip().strip('"').strip("'")
url = urllib.parse.urlparse(v.get('SUPABASE_URL', ''))
redis = urllib.parse.urlparse(v.get('REDIS_URL', 'redis://localhost:6379'))
local = {'localhost', '127.0.0.1', '::1'}
if url.hostname not in local or redis.hostname not in local: sys.exit(1)
if v.get('NODE_ENV') == 'production': sys.exit(1)
if v.get('GOOGLE_MAPS_MODE', 'mock') != 'mock' or v.get('RAZORPAY_MODE', 'mock') != 'mock': sys.exit(1)
PY
}
if ! local_backend_config; then
  note '- FAIL: backend .env is not confirmed local with mock providers'; exit 1
fi
note '- PASS: backend configured for local Supabase and mock providers'

port_pid() { lsof -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null | head -1; }
if [[ -z "$(port_pid 3000)" ]]; then
  [[ -f "$BACKEND/dist/main.js" ]] || { note '- FAIL: backend build missing'; exit 1; }
  (cd "$BACKEND" && NODE_ENV=development GOOGLE_MAPS_MODE=mock RAZORPAY_MODE=mock nohup node dist/main.js >"$LOG_DIR/backend.log" 2>&1 &)
  STARTED_BACKEND='yes'
fi
for _ in {1..30}; do
  if curl -fsS --max-time 2 http://127.0.0.1:3000/v1/health >/dev/null 2>&1; then break; fi
  sleep 2
done
if ! curl -fsS --max-time 3 http://127.0.0.1:3000/v1/health >/dev/null 2>&1; then
  note '- FAIL: port 3000 does not serve the B&W health endpoint'; exit 1
fi
note "- PASS: backend health on port 3000 (started: $STARTED_BACKEND)"

if [[ -z "$(port_pid 8081)" ]]; then
  (cd "$MOBILE" && nohup npm start -- --port 8081 >"$LOG_DIR/metro.log" 2>&1 &)
  STARTED_METRO='yes'
fi
for _ in {1..30}; do
  if [[ "$(curl -fsS --max-time 2 http://127.0.0.1:8081/status 2>/dev/null || true)" == 'packager-status:running' ]]; then break; fi
  sleep 2
done
if [[ "$(curl -fsS --max-time 3 http://127.0.0.1:8081/status 2>/dev/null || true)" != 'packager-status:running' ]]; then
  note '- FAIL: port 8081 is not Metro'; exit 1
fi
note "- PASS: Metro on port 8081 (started: $STARTED_METRO)"

# Prefer an already booted emulator. Create a Google APIs ARM64 image only when needed.
DEVICE="$($ADB devices | awk '$2 == "device" && $1 ~ /^emulator-/ {print $1; exit}')"
if [[ -z "$DEVICE" ]]; then
  AVD="$($EMULATOR -list-avds | rg 'BrightWhite|API_36|Google' | head -1 || true)"
  if [[ -z "$AVD" ]]; then
    IMAGE='system-images;android-36;google_apis;arm64-v8a'
    if [[ ! -d "$SDK/system-images/android-36/google_apis/arm64-v8a" ]]; then
      note '- INFO: installing Google APIs ARM64 Android 36 image'
      "$SDKMANAGER" "$IMAGE" >"$LOG_DIR/sdkmanager.log" 2>&1 || { note '- FAIL: system image install failed'; exit 1; }
    fi
    AVD='BrightWhite_API_36'
    echo no | "$AVDMANAGER" create avd -n "$AVD" -k "$IMAGE" --force >"$LOG_DIR/avd.log" 2>&1 || { note '- FAIL: AVD creation failed'; exit 1; }
  fi
  nohup "$EMULATOR" -avd "$AVD" -no-snapshot-load >"$LOG_DIR/emulator.log" 2>&1 &
  note "- INFO: started AVD $AVD"
fi
for _ in {1..120}; do
  DEVICE="$($ADB devices | awk '$2 == "device" && $1 ~ /^emulator-/ {print $1; exit}')"
  if [[ -n "$DEVICE" && "$($ADB -s "$DEVICE" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == 1 ]]; then break; fi
  sleep 2
done
[[ -n "$DEVICE" && "$($ADB -s "$DEVICE" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == 1 ]] || { note '- FAIL: emulator did not finish booting'; exit 1; }
ABI="$($ADB -s "$DEVICE" shell getprop ro.product.cpu.abi | tr -d '\r')"
if [[ "$ABI" != arm64-v8a ]]; then note "- FAIL: emulator ABI is $ABI"; exit 1; fi
note "- PASS: booted ARM64 emulator $DEVICE"
"$ADB" -s "$DEVICE" reverse tcp:8081 tcp:8081 >/dev/null
"$ADB" -s "$DEVICE" reverse tcp:3000 tcp:3000 >/dev/null

note ''
note '## Automated gates'
check 'mobile TypeScript' bash -c 'cd "$1" && ./node_modules/.bin/tsc --noEmit' _ "$MOBILE" || true
check 'mobile strict ESLint' bash -c 'cd "$1" && ./node_modules/.bin/eslint . --max-warnings=0' _ "$MOBILE" || true
check 'mobile regression' bash -c 'cd "$1" && npm test -- --runInBand --watch=false --watchman=false' _ "$MOBILE" || true
check 'backend build' bash -c 'cd "$1" && npm run build' _ "$BACKEND" || true
check 'backend regression' bash -c 'cd "$1" && npm test -- --runInBand' _ "$BACKEND" || true
check 'local Supabase DB' docker exec supabase_db_backend pg_isready -U postgres -d postgres || true
check 'local Supabase migration list' bash -c 'cd "$1" && ./node_modules/.bin/supabase migration list --local' _ "$BACKEND" || true
check 'Android assembleDebug with local Gradle' bash -c 'cd "$1" && "$2" :app:assembleDebug --offline --no-daemon' _ "$MOBILE/android" "$GRADLE" || true

APK="$MOBILE/android/app/build/outputs/apk/debug/app-debug.apk"
if [[ -f "$APK" ]]; then
  check 'install debug APK' "$ADB" -s "$DEVICE" install -r "$APK" || true
  "$ADB" -s "$DEVICE" logcat -c >/dev/null 2>&1 || true
  check 'launch app' "$ADB" -s "$DEVICE" shell am start -n com.brightwhitemobile/.MainActivity || true
  sleep 12
  "$ADB" -s "$DEVICE" logcat -d -v brief >"$LOG_DIR/logcat.raw" 2>/dev/null || true
  if rg -qi 'Google Maps Android API|MapsInitializer|AirMapRenderer|Authorization failure|API key|MapView|GLRenderer|DynamiteModule' "$LOG_DIR/logcat.raw"; then
    note '- INFO: Maps-related log entries were captured after launch'
  else
    note '- INFO: no Maps initialization seen after launch; map screen was not opened'
  fi
  if rg -qi 'Authorization failure|API key not found|API key invalid|Google Maps Android API.*(error|failure)' "$LOG_DIR/logcat.raw"; then
    note '- FAIL: Maps API authorization signal in logcat'
    FAIL=$((FAIL+1))
  elif rg -qi 'Google Maps Android API|AirMapRenderer|MapsInitializer' "$LOG_DIR/logcat.raw"; then
    note '- PASS: Maps initialized without an observed authorization failure'
    PASS=$((PASS+1))
  else
    note '- PENDING: Maps authorization cannot be checked until the map screen opens'
  fi
  if rg -qi 'renderer version\(legacy\)|Init with renderer: LEGACY' "$LOG_DIR/logcat.raw"; then
    note '- INFO: Google Play services loaded the legacy renderer'
  fi
else
  note '- FAIL: debug APK missing'
  FAIL=$((FAIL+1))
fi

note ''
note "Automated result: $PASS passed, $FAIL failed."
note 'Development map visual and tap acceptance: pending one manual check.'
note 'Release signing: still uses debug signing; no signing changes made.'
if [[ "$FAIL" -ne 0 ]]; then exit 1; fi

# Record only this harness in the mobile repository after every gate passes.
if [[ -n "$(git -C "$MOBILE" diff --cached --name-only)" ]]; then
  note '- INFO: checkpoint skipped because the index already contains staged work'
else
  git -C "$MOBILE" add -- scripts/android-automation.sh jest.config.js __tests__/App.test.tsx src/config/environment.ts src/screens/LocationPickerScreen.tsx src/components/DevelopmentMapView.tsx
  if git -C "$MOBILE" diff --cached --quiet; then
    note '- INFO: checkpoint already current'
  elif git -C "$MOBILE" commit -m 'checkpoint(6L-ANDROID): verified Android automation' --only -- scripts/android-automation.sh jest.config.js __tests__/App.test.tsx src/config/environment.ts src/screens/LocationPickerScreen.tsx src/components/DevelopmentMapView.tsx >"$LOG_DIR/commit.log" 2>&1; then
    note "- PASS: git checkpoint $(git -C "$MOBILE" rev-parse --short HEAD)"
  else
    note '- FAIL: git checkpoint could not be created'
    exit 1
  fi
fi
note 'After opening the map, ./bw android map-check verifies the mock view without printing secrets.'
note 'Final manual acceptance: open Cart → Continue → Add New Address → Choose Location on Map; verify the Development Map and tap to select a test location.'
note "Report: $REPORT"
