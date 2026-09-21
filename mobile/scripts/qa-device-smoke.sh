#!/usr/bin/env bash
set -Eeuo pipefail
PHASE='setup'
trap 'echo "FAIL: Android smoke command failed during $PHASE"' ERR
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
ADB="$SDK/platform-tools/adb"
APK="$(cd "$(dirname "$0")/.." && pwd)/android/app/build/outputs/apk/debug/app-debug.apk"
[[ -x "$ADB" && -f "$APK" ]] || { echo 'Android SDK or debug APK unavailable'; exit 1; }
DEVICE="$($ADB devices | awk '$2 == "device" && $1 ~ /^emulator-/ {print $1; exit}')"
[[ -n "$DEVICE" ]] || { echo 'No Android emulator available'; exit 1; }
MODE="${1:-}"
[[ "$MODE" == 'restore' || "$MODE" == 'fresh' ]] || { echo 'Usage: qa-device-smoke.sh restore|fresh'; exit 2; }

# Existing-session restore: only claim this if a signed-in Home screen is visible
# both before and after a force-stop. Do not read or print account data.
if [[ "$MODE" == 'restore' ]]; then
PHASE='existing launch'
"$ADB" -s "$DEVICE" shell am start -n com.brightwhitemobile/.MainActivity >/dev/null
sleep 5
PHASE='existing UI capture'
"$ADB" -s "$DEVICE" shell uiautomator dump /sdcard/bw-6u-before.xml >/dev/null 2>&1
BEFORE="$($ADB -s "$DEVICE" shell cat /sdcard/bw-6u-before.xml 2>/dev/null || true)"
"$ADB" -s "$DEVICE" shell am force-stop com.brightwhitemobile
PHASE='restored launch'
"$ADB" -s "$DEVICE" shell am start -n com.brightwhitemobile/.MainActivity >/dev/null
sleep 5
PHASE='restored UI capture'
AFTER=''
for _ in {1..10}; do
  "$ADB" -s "$DEVICE" shell uiautomator dump /sdcard/bw-6u-restored.xml >/dev/null 2>&1 || true
  AFTER="$($ADB -s "$DEVICE" shell cat /sdcard/bw-6u-restored.xml 2>/dev/null || true)"
  [[ "$AFTER" == *'What do you need?'* ]] && break
  sleep 2
done
if [[ "$BEFORE" == *'What do you need?'* && "$AFTER" == *'What do you need?'* ]]; then
  echo 'PASS: signed-in screen survived force-stop and restore'
else
  echo 'FAIL: signed-in session restore could not be proven on this emulator'
  exit 1
fi
exit 0
fi

# Fresh install deliberately clears only this development app's emulator data.
PHASE='clear development app data'
"$ADB" -s "$DEVICE" shell pm clear com.brightwhitemobile >/dev/null
PHASE='install debug APK'
"$ADB" -s "$DEVICE" install -r "$APK" >/dev/null
PHASE='clear app log'
"$ADB" -s "$DEVICE" logcat -c
PHASE='fresh launch'
"$ADB" -s "$DEVICE" shell am start -n com.brightwhitemobile/.MainActivity >/dev/null
sleep 4
PHASE='process check'
PID="$($ADB -s "$DEVICE" shell pidof com.brightwhitemobile | tr -d '\r')"
[[ -n "$PID" ]] || { echo 'FAIL: app did not launch after fresh install'; exit 1; }
PHASE='fresh UI capture'
FRESH=''
for _ in {1..8}; do
  "$ADB" -s "$DEVICE" shell uiautomator dump /sdcard/bw-6u-fresh.xml >/dev/null 2>&1 || true
  FRESH="$($ADB -s "$DEVICE" shell cat /sdcard/bw-6u-fresh.xml 2>/dev/null || true)"
  if [[ "$FRESH" == *'Login'* || "$FRESH" == *'Welcome'* || "$FRESH" == *'Bright &amp; White'* ]]; then break; fi
  sleep 3
done
if [[ "$FRESH" != *'Login'* && "$FRESH" != *'Welcome'* && "$FRESH" != *'Bright &amp; White'* ]]; then
  echo 'FAIL: fresh install UI was not recognized'
  exit 1
fi
PHASE='fatal log sweep'
if "$ADB" -s "$DEVICE" logcat -d --pid="$PID" | rg -qi 'FATAL EXCEPTION|ReactNativeJS.*(TypeError|ReferenceError|Invariant Violation)'; then
  echo 'FAIL: app fatal error detected after fresh install'
  exit 1
fi
echo 'PASS: fresh install launches with no observed fatal app error'
