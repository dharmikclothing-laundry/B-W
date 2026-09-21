#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MOBILE="$ROOT/mobile"
BACKEND="$ROOT/backend"
REPORT_DIR="$ROOT/reports/milestones"
REPORT="$REPORT_DIR/6U-FINAL-CUSTOMER-QA-$(date +%Y%m%d-%H%M%S).md"
LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/bw-6u.XXXXXX")"
PASS=0
FAIL=0
BACKEND_PID=''
METRO_PID=''
cleanup() {
  [[ -z "$BACKEND_PID" ]] || kill "$BACKEND_PID" 2>/dev/null || true
  [[ -z "$METRO_PID" ]] || kill "$METRO_PID" 2>/dev/null || true
  rm -rf "$LOG_DIR"
}
trap cleanup EXIT
mkdir -p "$REPORT_DIR"
chmod 700 "$REPORT_DIR" "$LOG_DIR"
note() { printf '%s\n' "$*" | tee -a "$REPORT"; }
gate() {
  local name="$1"; shift
  if "$@" >"$LOG_DIR/gate.log" 2>&1; then
    note "- PASS: $name"; PASS=$((PASS + 1))
  else
    note "- FAIL: $name"; FAIL=$((FAIL + 1))
  fi
}
printf '# B&W 6U — Final Customer QA & Release Hardening\n\nRun: %s\n\n## Gates\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" > "$REPORT"
gate 'Development/UAT local Supabase and mock providers only' python3 "$MOBILE/scripts/qa-release-audit.py" local-safety
if [[ "$FAIL" -ne 0 ]]; then note 'Stopped before any service, build or device action because local safety failed.'; exit 1; fi
gate 'local Supabase readiness' bash -c 'cd "$1" && ./node_modules/.bin/supabase status >/dev/null' _ "$BACKEND"
gate 'local pricing, loyalty and package transaction tests' bash -c 'cd "$1" && ./node_modules/.bin/supabase migration up --local --yes >/dev/null && for test_file in supabase/tests/6r_checkout_rewards.sql supabase/tests/6r_earning.sql supabase/tests/6s_package_usage.sql; do ./node_modules/.bin/supabase test db --local "$test_file" || exit; done' _ "$BACKEND"
gate 'backend full regression' bash -c 'cd "$1" && npm test -- --runInBand --watchman=false' _ "$BACKEND"
gate 'backend build and strict ESLint' bash -c 'cd "$1" && npm run build && ./node_modules/.bin/eslint src test --max-warnings=0' _ "$BACKEND"
gate 'customer journey component and API regression' bash -c 'cd "$1" && npm test -- --runInBand --watch=false --watchman=false src/services/api.test.ts src/services/sessionManager.test.ts src/services/orderOtpApi.test.ts src/services/orderTrackingApi.test.ts src/services/notificationsApi.test.ts src/services/claimsApi.test.ts src/services/packagesApi.test.ts src/services/growthApi.test.ts src/components/OrderCareSection.test.tsx src/screens/OrderReviewScreen.test.tsx src/screens/ReceiptScreen.test.tsx' _ "$MOBILE"
gate 'mobile full regression' bash -c 'cd "$1" && npm test -- --runInBand --watch=false --watchman=false' _ "$MOBILE"
gate 'mobile TypeScript' bash -c 'cd "$1" && ./node_modules/.bin/tsc --noEmit' _ "$MOBILE"
gate 'mobile strict ESLint' bash -c 'cd "$1" && ./node_modules/.bin/eslint . --max-warnings=0' _ "$MOBILE"
gate 'tracked and new source secret scan' python3 "$MOBILE/scripts/qa-release-audit.py" secrets
gate 'protected local settings untouched' bash -c '
  ! git -C "$1" status --porcelain | grep -E "android/local[.]properties|[.]env" | grep -v "[.]env[.]example" &&
  ! git -C "$2" status --porcelain | grep -E "[.]env|supabase/config[.]toml"
' _ "$MOBILE" "$BACKEND"

if [[ -z "${JAVA_HOME:-}" && -x /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home/bin/java ]]; then
  export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
fi
GRADLE="$HOME/.gradle/manual/gradle-9.4.1/bin/gradle"
if [[ -x "$GRADLE" && -n "${JAVA_HOME:-}" ]]; then
  gate 'Android debug build' bash -c 'cd "$1" && "$2" :app:assembleDebug --offline --no-daemon' _ "$MOBILE/android" "$GRADLE"
  gate 'Android Release variant offline build' bash -c 'cd "$1" && "$2" :app:assembleRelease --offline --no-daemon' _ "$MOBILE/android" "$GRADLE"
else
  note '- FAIL: Android builds (local Gradle 9.4.1 or JDK unavailable)'; FAIL=$((FAIL + 1))
fi
gate 'Android release signing and production configuration readiness' python3 "$MOBILE/scripts/qa-release-audit.py" android-readiness
gate 'iOS Release simulator build without signing' bash -c 'cd "$1" && xcodebuild -quiet -workspace BrightWhiteMobile.xcworkspace -scheme BrightWhiteMobile -configuration Release -sdk iphonesimulator -destination "generic/platform=iOS Simulator" -derivedDataPath "$2" CODE_SIGNING_ALLOWED=NO build' _ "$MOBILE/ios" /private/tmp/bw-6u-ios-derived
gate 'iOS bundle, Firebase and signing readiness' python3 "$MOBILE/scripts/qa-release-audit.py" ios-readiness

if [[ "$FAIL" -eq 0 || -f "$MOBILE/android/app/build/outputs/apk/debug/app-debug.apk" ]]; then
  SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
  if [[ -z "$(lsof -tiTCP:3000 -sTCP:LISTEN 2>/dev/null || true)" ]]; then
    (cd "$BACKEND" && NODE_ENV=development GOOGLE_MAPS_MODE=mock RAZORPAY_MODE=mock node dist/main.js) >"$LOG_DIR/backend.log" 2>&1 & BACKEND_PID=$!
  fi
  if [[ -z "$(lsof -tiTCP:8081 -sTCP:LISTEN 2>/dev/null || true)" ]]; then
    (cd "$MOBILE" && npm start -- --port 8081) >"$LOG_DIR/metro.log" 2>&1 & METRO_PID=$!
  fi
  ready='no'
  for _ in {1..30}; do
    if curl -fsS --max-time 2 http://127.0.0.1:3000/v1/health >/dev/null 2>&1 &&
       [[ "$(curl -fsS --max-time 2 http://127.0.0.1:8081/status 2>/dev/null || true)" == 'packager-status:running' ]]; then
      ready='yes'; break
    fi
    sleep 2
  done
  if [[ "$ready" == 'yes' ]]; then
    note '- PASS: local backend and Metro ready for device smoke'; PASS=$((PASS + 1))
    export ANDROID_HOME="$SDK" ANDROID_SDK_ROOT="$SDK"
    gate 'existing signed-in session restore on emulator' bash "$MOBILE/scripts/qa-device-smoke.sh" restore
    gate 'fresh Android install, launch and fatal-log sweep' bash "$MOBILE/scripts/qa-device-smoke.sh" fresh
  else
    note '- FAIL: local backend and Metro unavailable for device smoke'; FAIL=$((FAIL + 1))
  fi
fi

if [[ -f "$MOBILE/e2e/customer-journey.spec.ts" && -f "$MOBILE/e2e/ios-navigation.spec.ts" ]]; then
  gate 'device end-to-end journey and iOS navigation suites present' true
else
  note '- FAIL: authenticated device end-to-end journey and iOS navigation are not proven by the current test harness'; FAIL=$((FAIL + 1))
fi
note ''
note "Automated result: $PASS passed, $FAIL failed."
note ''
note '## Coverage and limits'
note '- Login/logout/session expiry, browse/cart/address/slot/checkout, rewards/package/payment combinations, order confirmation, OTPs, tracking, notifications/deep links, cancellation/claims/refunds, history and receipt have backend or mobile unit/integration coverage.'
note '- Delivery OTP with mandatory photo has backend regression coverage; an authenticated pickup-to-delivery device run was not executed.'
note '- Offline and stalled API requests have mobile tests. Checkout retries carry a stable order idempotency key, checked against a customer-scoped unique database index.'
note '- App render and screen tests cover loading/empty/error paths; Android hardware back and iOS native navigation were not exercised end to end.'
note '- Emulator crash sweep observes startup after fresh install only; it does not cover every customer screen.'
note 'The development emulator may have its B&W app data cleared by the fresh-install check.'
note 'No production Supabase, Razorpay, FCM or Maps credentials were used. Release activation remains blocked until explicitly configured.'
note 'Release activation requires private Android signing, an HTTPS production API, separate Firebase files, and a distribution Apple team.'
note 'Formal tax invoices remain unavailable pending a billing contract with invoice number and merchant tax identity.'
if [[ "$FAIL" -ne 0 ]]; then note 'Final customer-app checkpoint skipped because at least one gate failed.'; note "Report: $REPORT"; exit 1; fi
if [[ "${BW_SKIP_CHECKPOINT:-0}" == '1' ]]; then note 'Final customer-app checkpoint skipped by request.'; note "Report: $REPORT"; exit 0; fi

MOBILE_FILES=(App.tsx src/services/api.ts src/services/api.test.ts scripts/qa-release-audit.py scripts/qa-device-smoke.sh scripts/final-customer-qa.sh)
[[ -z "$(git -C "$MOBILE" diff --cached --name-only)" ]] || { note 'Checkpoint skipped: staged changes found.'; exit 1; }
allowed=" ${MOBILE_FILES[*]} "
while IFS= read -r line; do
  path="${line:3}"
  [[ "$allowed" == *" $path "* ]] || { note "Checkpoint skipped: unrelated change $path"; exit 1; }
done < <(git -C "$MOBILE" status --porcelain)
[[ -z "$(git -C "$BACKEND" status --porcelain)" ]] || { note 'Checkpoint skipped: backend has uncommitted changes.'; exit 1; }
git -C "$MOBILE" add -- "${MOBILE_FILES[@]}"
git -C "$MOBILE" commit -m 'checkpoint(6U): final customer QA and release hardening' >"$LOG_DIR/commit.log" 2>&1 || { note 'Final checkpoint failed.'; exit 1; }
note "Mobile checkpoint: $(git -C "$MOBILE" rev-parse --short HEAD)"
note "Report: $REPORT"
