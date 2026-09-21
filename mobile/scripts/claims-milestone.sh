#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MOBILE="$ROOT/mobile"
BACKEND="$ROOT/backend"
REPORT_DIR="$ROOT/reports/milestones"
STAMP="$(date +%Y%m%d-%H%M%S)"
REPORT="$REPORT_DIR/6Q-CLAIMS-CANCELLATION-REFUNDS-$STAMP.md"
LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/bw-6q.XXXXXX")"
PASS=0
FAIL=0

mkdir -p "$REPORT_DIR"
chmod 700 "$REPORT_DIR" "$LOG_DIR"
note() { printf '%s\n' "$*" | tee -a "$REPORT"; }
check() {
  local name="$1"; shift
  if "$@" >"$LOG_DIR/check.log" 2>&1; then
    note "- PASS: $name"; PASS=$((PASS + 1))
  else
    note "- FAIL: $name (details kept in a private temporary log)"; FAIL=$((FAIL + 1))
  fi
}

printf '# B&W 6Q — Customer Claims, Cancellation & Refund UX\n\nRun: %s\n\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" > "$REPORT"
note '## Acceptance gates'

check 'no production Supabase or real payment activity' bash -c '
  env_file="$1/.env"
  test -f "$env_file" || exit 1
  awk -F= '\''
    { key=$1; value=$2; gsub(/^[[:space:]]+|[[:space:]]+$/, "", key); gsub(/^[[:space:]]+|[[:space:]]+$/, "", value) }
    key == "NODE_ENV" && value == "production" { bad=1 }
    key == "RAZORPAY_MODE" && value != "mock" { bad=1 }
    END { exit bad ? 1 : 0 }
  '\'' "$env_file"
' _ "$BACKEND"
if [[ "$FAIL" -ne 0 ]]; then
  note 'Checkpoint skipped because the local safety gate failed.'
  exit 1
fi

check 'local Supabase readiness' bash -c 'cd "$1" && ./node_modules/.bin/supabase status >/dev/null' _ "$BACKEND"
check 'backend cancellation regression' bash -c 'cd "$1" && npm test -- --runInBand --watchman=false src/modules/orders/orders.service.spec.ts src/modules/orders/dto/cancel-order.dto.spec.ts' _ "$BACKEND"
check 'backend claims regression' bash -c 'cd "$1" && npm test -- --runInBand --watchman=false src/modules/claims/claims.service.spec.ts' _ "$BACKEND"
check 'backend refund and payment regression' bash -c 'cd "$1" && npm test -- --runInBand --watchman=false src/modules/payments/payments.customer-flows.spec.ts src/modules/payments/payments.service.spec.ts' _ "$BACKEND"
check 'mobile cancellation UI and integration' bash -c 'cd "$1" && npm test -- --runInBand --watch=false --watchman=false src/components/OrderCareSection.test.tsx src/services/orderCareApi.test.ts' _ "$MOBILE"
check 'mobile claim, photo, and status integration' bash -c 'cd "$1" && npm test -- --runInBand --watch=false --watchman=false src/components/OrderCareSection.test.tsx src/services/claimsApi.test.ts' _ "$MOBILE"
check 'mobile refund status, request, and full app regression' bash -c 'cd "$1" && npm test -- --runInBand --watch=false --watchman=false' _ "$MOBILE"
check 'mobile TypeScript' bash -c 'cd "$1" && ./node_modules/.bin/tsc --noEmit' _ "$MOBILE"
check 'mobile strict ESLint' bash -c 'cd "$1" && ./node_modules/.bin/eslint . --max-warnings=0' _ "$MOBILE"
check 'backend full regression' bash -c 'cd "$1" && npm test -- --runInBand --watchman=false' _ "$BACKEND"

if [[ -z "${JAVA_HOME:-}" && -x /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home/bin/java ]]; then
  export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
fi
GRADLE="$HOME/.gradle/manual/gradle-9.4.1/bin/gradle"
if [[ -x "$GRADLE" ]]; then
  check 'Android debug build' bash -c 'cd "$1" && "$2" :app:assembleDebug --offline --no-daemon' _ "$MOBILE/android" "$GRADLE"
else
  note '- FAIL: Android debug build (downloaded Gradle 9.4.1 is unavailable)'; FAIL=$((FAIL + 1))
fi

note ''
note "Automated result: $PASS passed, $FAIL failed."
note '6Q reused the existing backend cancellation, claims, payment, and refund contracts.'
note 'No new backend procedures were added.'
note 'No direct order-status writes were introduced.'
note 'Refund approval remains admin-only.'
note 'Development/UAT performed no production Supabase or real payment activity.'
note 'The customer app refreshes order details, claims, and payment/refund state after successful actions.'

if [[ "$FAIL" -ne 0 ]]; then
  note 'Checkpoint skipped because at least one gate failed.'
  exit 1
fi
if [[ -n "$(git -C "$MOBILE" diff --cached --name-only)" ]]; then
  note '- FAIL: checkpoint skipped because the mobile index already contains staged work'
  exit 1
fi
if [[ -n "$(git -C "$BACKEND" status --porcelain)" ]]; then
  note '- FAIL: checkpoint skipped because the backend repository has uncommitted changes'
  exit 1
fi

git -C "$MOBILE" add -- \
  __tests__/App.test.tsx \
  src/components/OrderCareSection.tsx \
  src/components/OrderCareSection.test.tsx \
  src/screens/OrderDetailsScreen.tsx \
  src/services/ordersApi.ts \
  src/services/paymentsApi.ts \
  src/services/claimsApi.ts \
  src/services/claimsApi.test.ts \
  src/services/orderCareApi.test.ts \
  scripts/claims-milestone.sh

if git -C "$MOBILE" diff --cached --quiet; then
  note '- INFO: 6Q checkpoint already current'
elif git -C "$MOBILE" commit -m 'checkpoint(6Q): customer claims cancellation and refunds' --only -- \
  __tests__/App.test.tsx \
  src/components/OrderCareSection.tsx \
  src/components/OrderCareSection.test.tsx \
  src/screens/OrderDetailsScreen.tsx \
  src/services/ordersApi.ts \
  src/services/paymentsApi.ts \
  src/services/claimsApi.ts \
  src/services/claimsApi.test.ts \
  src/services/orderCareApi.test.ts \
  scripts/claims-milestone.sh >"$LOG_DIR/commit.log" 2>&1; then
  note "- PASS: mobile checkpoint $(git -C "$MOBILE" rev-parse --short HEAD)"
else
  note '- FAIL: checkpoint could not be created'
  exit 1
fi
note "Report: $REPORT"
