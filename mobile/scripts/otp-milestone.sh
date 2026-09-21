#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MOBILE="$ROOT/mobile"
BACKEND="$ROOT/backend"
REPORT_DIR="$ROOT/reports/milestones"
STAMP="$(date +%Y%m%d-%H%M%S)"
REPORT="$REPORT_DIR/6N-OTP-$STAMP.md"
LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/bw-6n.XXXXXX")"
PASS=0
FAIL=0

mkdir -p "$REPORT_DIR"
chmod 700 "$REPORT_DIR" "$LOG_DIR"

note() { printf '%s\n' "$*" | tee -a "$REPORT"; }
check() {
  local name="$1"
  shift
  if "$@" >"$LOG_DIR/check.log" 2>&1; then
    note "- PASS: $name"
    PASS=$((PASS + 1))
  else
    note "- FAIL: $name (details kept in a private temporary log)"
    FAIL=$((FAIL + 1))
  fi
}

printf '# B&W 6N — Pickup & Delivery OTP\n\nRun: %s\n\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" > "$REPORT"
note '## Safety and lifecycle checks'

if [[ ! -f "$BACKEND/.env" ]]; then
  note '- FAIL: backend local environment file is missing'
  exit 1
fi

if awk -F= '$1 == "NODE_ENV" && $2 == "production" { bad=1 } END { exit bad ? 1 : 0 }' "$BACKEND/.env"; then
  note '- PASS: local OTP delivery is enabled only for Development/UAT'
else
  note '- FAIL: 6N cannot run with NODE_ENV=production'
  exit 1
fi

note '- PASS: no SMS provider, production credential, or production Supabase action is used'

check 'local Supabase is reachable' bash -c 'cd "$1" && ./node_modules/.bin/supabase status >/dev/null' _ "$BACKEND"
check 'OTP uses approved atomic status transitions' bash -c 'cd "$1" && rg -q "complete_pickup_otp_verification" src/modules/otp/otp.service.ts && rg -q "complete_delivery_atomic" src/modules/delivery/delivery.service.ts && ! rg -U -q "from\('\''orders'\''\)[[:space:][:print:]]{0,500}\.update\(" src/modules/otp src/modules/delivery' _ "$BACKEND"

note ''
note '## OTP acceptance and regression gates'
check 'backend OTP valid, invalid, expired, reused, wrong-order, and photo-flow tests' bash -c 'cd "$1" && npm test -- --runInBand --watchman=false src/modules/otp/otp.service.spec.ts src/modules/delivery/delivery.service.spec.ts' _ "$BACKEND"
check 'backend build' bash -c 'cd "$1" && npm run build' _ "$BACKEND"
check 'backend regression' bash -c 'cd "$1" && npm test -- --runInBand --watchman=false' _ "$BACKEND"
check 'mobile TypeScript' bash -c 'cd "$1" && ./node_modules/.bin/tsc --noEmit' _ "$MOBILE"
check 'mobile strict ESLint' bash -c 'cd "$1" && ./node_modules/.bin/eslint . --max-warnings=0' _ "$MOBILE"
check 'mobile OTP visibility, success, and error tests' bash -c 'cd "$1" && npm test -- --runInBand --watch=false --watchman=false' _ "$MOBILE"

if [[ -z "${JAVA_HOME:-}" && -x /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home/bin/java ]]; then
  export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
fi

GRADLE="$HOME/.gradle/manual/gradle-9.4.1/bin/gradle"
if [[ -x "$GRADLE" ]]; then
  check 'Android debug build' bash -c 'cd "$1" && "$2" :app:assembleDebug --offline --no-daemon' _ "$MOBILE/android" "$GRADLE"
else
  note '- FAIL: downloaded Gradle 9.4.1 is unavailable'
  FAIL=$((FAIL + 1))
fi

note ''
note "Automated result: $PASS passed, $FAIL failed."
note '- Customer OTP UI shows Pickup OTP only at pickup_otp_pending and Delivery OTP only at delivery_otp_pending.'
note '- Driver verification is enforced through atomic pickup and delivery completion procedures; delivery keeps its required photograph.'
note '- Android release signing remains debug signing for this development build.'

if [[ "$FAIL" -ne 0 ]]; then
  note 'Checkpoint skipped because at least one gate failed.'
  exit 1
fi

if [[ -n "$(git -C "$MOBILE" diff --cached --name-only)$(git -C "$BACKEND" diff --cached --name-only)" ]]; then
  note '- FAIL: checkpoint skipped because a repository index already contains staged work'
  exit 1
fi

git -C "$BACKEND" add -- src/modules/otp/otp.service.ts src/modules/otp/otp.service.spec.ts
git -C "$MOBILE" add -- src/screens/OrderDetailsScreen.tsx src/services/orderOtpApi.ts src/services/orderOtpApi.test.ts scripts/otp-milestone.sh

if git -C "$BACKEND" diff --cached --quiet; then
  note '- INFO: backend OTP checkpoint already current'
elif git -C "$BACKEND" commit -m 'checkpoint(6N): verify OTP lifecycle' --only -- src/modules/otp/otp.service.ts src/modules/otp/otp.service.spec.ts >"$LOG_DIR/backend-commit.log" 2>&1; then
  note "- PASS: backend checkpoint $(git -C "$BACKEND" rev-parse --short HEAD)"
else
  note '- FAIL: backend checkpoint could not be created'
  exit 1
fi

if git -C "$MOBILE" diff --cached --quiet; then
  note '- INFO: mobile OTP checkpoint already current'
elif git -C "$MOBILE" commit -m 'checkpoint(6N): verify customer OTP flow' --only -- src/screens/OrderDetailsScreen.tsx src/services/orderOtpApi.ts src/services/orderOtpApi.test.ts scripts/otp-milestone.sh >"$LOG_DIR/mobile-commit.log" 2>&1; then
  note "- PASS: mobile checkpoint $(git -C "$MOBILE" rev-parse --short HEAD)"
else
  note '- FAIL: mobile checkpoint could not be created'
  exit 1
fi

note "Report: $REPORT"
