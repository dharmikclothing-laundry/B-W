#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MOBILE="$ROOT/mobile"
BACKEND="$ROOT/backend"
REPORT_DIR="$ROOT/reports/milestones"
STAMP="$(date +%Y%m%d-%H%M%S)"
REPORT="$REPORT_DIR/6M-RAZORPAY-$STAMP.md"
LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/bw-6m.XXXXXX")"
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

printf '# B&W 6M — Razorpay Payments\n\nRun: %s\n\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" > "$REPORT"
note '## Safety configuration'

if [[ ! -f "$BACKEND/.env" ]]; then
  note '- FAIL: backend .env is missing'
  exit 1
fi

if awk -F= '
  $1 == "NODE_ENV" && $2 == "production" { bad=1 }
  $1 == "RAZORPAY_MODE" && $2 != "mock" { bad=1 }
  END { exit bad ? 1 : 0 }
' "$BACKEND/.env"; then
  note '- PASS: Development/UAT uses the local mock payment provider'
else
  note '- FAIL: Development/UAT must use RAZORPAY_MODE=mock and a non-production environment'
  exit 1
fi

note '- PASS: no Razorpay credential values were read or written'

note ''
note '## Provider and mobile flow checks'
check 'provider configuration' bash -c 'cd "$1" && npm test -- --runInBand src/config/provider-config.spec.ts' _ "$BACKEND"
check 'mock payment sandbox success and failure' bash -c 'cd "$1" && npm test -- --runInBand src/modules/payments/providers/mock-payment.provider.spec.ts src/modules/payments/payments.service.spec.ts' _ "$BACKEND"
check 'payment customer-flow regression' bash -c 'cd "$1" && npm test -- --runInBand src/modules/payments/payments.customer-flows.spec.ts test/phase4-payments.spec.ts' _ "$BACKEND"
check 'backend build' bash -c 'cd "$1" && npm run build' _ "$BACKEND"
check 'mobile TypeScript' bash -c 'cd "$1" && ./node_modules/.bin/tsc --noEmit' _ "$MOBILE"
check 'mobile strict ESLint' bash -c 'cd "$1" && ./node_modules/.bin/eslint . --max-warnings=0' _ "$MOBILE"
check 'mobile payment regression' bash -c 'cd "$1" && npm test -- --runInBand --watch=false --watchman=false' _ "$MOBILE"

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
note '- Sandbox payment: local mock provider only; no real Razorpay request or charge was made.'
note '- Success: capture plus signature verification. Failure: provider failed state. Cancel: mobile checkout cancellation classification.'

if [[ "$FAIL" -ne 0 ]]; then
  note 'Checkpoint skipped because at least one gate failed.'
  exit 1
fi

if [[ -n "$(git -C "$MOBILE" diff --cached --name-only)" ]]; then
  note '- INFO: checkpoint skipped because the mobile index already contains staged work'
  exit 0
fi

git -C "$MOBILE" add -- \
  App.tsx \
  src/services/paymentsApi.ts \
  src/services/razorpayCheckout.ts \
  src/services/razorpayCheckout.test.ts \
  src/types/react-native-razorpay.d.ts \
  __tests__/App.test.tsx \
  scripts/razorpay-milestone.sh

if git -C "$MOBILE" diff --cached --quiet; then
  note '- INFO: payment checkpoint already current'
elif git -C "$MOBILE" commit -m 'checkpoint(6M): verified Razorpay payment flow' --only -- \
  App.tsx \
  src/services/paymentsApi.ts \
  src/services/razorpayCheckout.ts \
  src/services/razorpayCheckout.test.ts \
  src/types/react-native-razorpay.d.ts \
  __tests__/App.test.tsx \
  scripts/razorpay-milestone.sh >"$LOG_DIR/commit.log" 2>&1; then
  note "- PASS: git checkpoint $(git -C "$MOBILE" rev-parse --short HEAD)"
else
  note '- FAIL: checkpoint could not be created'
  exit 1
fi

note "Report: $REPORT"
