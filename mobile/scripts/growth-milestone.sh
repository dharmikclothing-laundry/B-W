#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MOBILE="$ROOT/mobile"
BACKEND="$ROOT/backend"
REPORT_DIR="$ROOT/reports/milestones"
REPORT="$REPORT_DIR/6R-COUPONS-REFERRAL-LOYALTY-$(date +%Y%m%d-%H%M%S).md"
LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/bw-6r.XXXXXX")"
trap 'rm -rf "$LOG_DIR"' EXIT
PASS=0
FAIL=0
mkdir -p "$REPORT_DIR"
chmod 700 "$LOG_DIR" "$REPORT_DIR"
note() { printf '%s\n' "$*" | tee -a "$REPORT"; }
gate() {
  local name="$1"; shift
  if "$@" >"$LOG_DIR/gate.log" 2>&1; then
    note "- PASS: $name"; PASS=$((PASS + 1))
  else
    note "- FAIL: $name (private log omitted from report)"; FAIL=$((FAIL + 1))
  fi
}

printf '# B&W 6R — Coupons, Offers, Referral & Loyalty\n\nRun: %s\n\n## Acceptance gates\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" > "$REPORT"
gate 'Development/UAT mock and local provider safety' bash -c '
  awk -F= '\''
    {key=$1; value=$2; gsub(/^[[:space:]]+|[[:space:]]+$/, "", key); gsub(/^[[:space:]]+|[[:space:]]+$/, "", value);
     if(key=="NODE_ENV" && value=="production") bad=1;
     if(key=="RAZORPAY_MODE" && value!="mock") bad=1;
     if(key=="GOOGLE_MAPS_MODE" && value!="mock") bad=1;
     if(key=="SUPABASE_URL" && value!~/localhost|127[.]0[.]0[.]1/) bad=1;}
    END {exit bad ? 1 : 0}
  '\'' "$1/.env"
' _ "$BACKEND"
if [[ "$FAIL" -ne 0 ]]; then note 'Checkpoint skipped: local safety gate failed.'; exit 1; fi

gate 'local Supabase readiness' bash -c 'cd "$1" && ./node_modules/.bin/supabase status >/dev/null' _ "$BACKEND"
gate 'local Supabase 6R migration and transaction tests' bash -c 'cd "$1" && ./node_modules/.bin/supabase migration up --local --yes >/dev/null && ./node_modules/.bin/supabase test db --local supabase/tests/6r_checkout_rewards.sql' _ "$BACKEND"
gate 'approved loyalty earning rule and local acceptance test' bash -c 'cd "$1" && test -f supabase/tests/6r_earning.sql && ./node_modules/.bin/supabase test db --local supabase/tests/6r_earning.sql' _ "$BACKEND"
gate 'backend growth and pricing tests' bash -c 'cd "$1" && npm test -- --runInBand --watchman=false src/modules/growth/growth.service.spec.ts src/modules/orders/order-pricing.spec.ts' _ "$BACKEND"
gate 'backend full regression' bash -c 'cd "$1" && npm test -- --runInBand --watchman=false' _ "$BACKEND"
gate 'backend build and strict lint' bash -c 'cd "$1" && npm run build && ./node_modules/.bin/eslint src test --max-warnings=0' _ "$BACKEND"
gate 'mobile coupons, loyalty, referral and pricing tests' bash -c 'cd "$1" && npm test -- --runInBand --watch=false --watchman=false src/components/CouponSection.test.tsx src/components/LoyaltySection.test.tsx src/screens/BenefitsScreen.test.tsx src/screens/OrderReviewScreen.test.tsx src/services/growthApi.test.ts src/utils/orderPricing.test.ts' _ "$MOBILE"
gate 'mobile full regression' bash -c 'cd "$1" && npm test -- --runInBand --watch=false --watchman=false' _ "$MOBILE"
gate 'mobile TypeScript' bash -c 'cd "$1" && ./node_modules/.bin/tsc --noEmit' _ "$MOBILE"
gate 'mobile strict ESLint' bash -c 'cd "$1" && ./node_modules/.bin/eslint . --max-warnings=0' _ "$MOBILE"

if [[ -z "${JAVA_HOME:-}" && -x /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home/bin/java ]]; then
  export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
fi
GRADLE="$HOME/.gradle/manual/gradle-9.4.1/bin/gradle"
if [[ -x "$GRADLE" ]]; then
  gate 'Android debug build' bash -c 'cd "$1" && "$2" :app:assembleDebug --offline --no-daemon' _ "$MOBILE/android" "$GRADLE"
else
  note '- FAIL: Android debug build (local Gradle 9.4.1 unavailable)'; FAIL=$((FAIL + 1))
fi
gate 'no release signing or protected files changed' bash -c '
  ! git -C "$1" status --porcelain | grep -E "android/local[.]properties|android/app/build[.]gradle|[.]env" &&
  ! git -C "$2" status --porcelain | grep -E "[.]env|supabase/config[.]toml"
' _ "$MOBILE" "$BACKEND"

note ''
note "Automated result: $PASS passed, $FAIL failed."
note 'Coupon and loyalty discounts are recalculated on the server; 10 points = ₹1, the minimum redemption is 1,000 points (₹100), and points redeem only at checkout.'
note 'Paid and delivered orders earn 0.01 point per ₹1, rounded down to whole points per order; COD is treated as paid at delivery.'
note 'Development/UAT checks use local Supabase and mock providers; no production messaging or payment was used.'
note 'Limited-use offers remain unavailable until redemption counting is implemented.'
if [[ ! -f "$BACKEND/supabase/tests/6r_earning.sql" ]]; then
  note 'Loyalty earning rate is awaiting an approved business rule; no points are minted automatically.'
fi
if [[ "$FAIL" -ne 0 ]]; then note 'Checkpoint skipped because at least one gate failed.'; exit 1; fi

BACKEND_FILES=(docs/phase4_api_endpoints.md src/modules/growth/growth.controller.ts src/modules/growth/growth.module.ts src/modules/growth/growth.service.ts src/modules/growth/growth.service.spec.ts src/modules/orders/dto/create-order.dto.ts src/modules/orders/order-pricing.ts src/modules/orders/order-pricing.spec.ts src/modules/orders/orders.module.ts src/modules/orders/orders.service.ts src/modules/orders/orders.service.spec.ts supabase/migrations/20260918010000_6r_atomic_loyalty_redemption.sql supabase/migrations/20260918130000_6r_restore_cancelled_loyalty.sql supabase/migrations/20260918140000_6r_minimum_loyalty_redemption.sql supabase/migrations/20260918150000_6r_loyalty_earning.sql supabase/migrations/20260918160000_6r_disable_standalone_redemption.sql supabase/tests/6r_checkout_rewards.sql supabase/tests/6r_earning.sql)
MOBILE_FILES=(App.tsx src/components/CouponSection.tsx src/components/CouponSection.test.tsx src/components/LoyaltySection.tsx src/components/LoyaltySection.test.tsx src/screens/BenefitsScreen.tsx src/screens/BenefitsScreen.test.tsx src/screens/HomeScreen.tsx src/screens/OrderReviewScreen.tsx src/screens/OrderReviewScreen.test.tsx src/screens/PaymentScreen.tsx src/services/growthApi.ts src/services/growthApi.test.ts src/types/order.ts src/utils/orderPricing.ts src/utils/orderPricing.test.ts scripts/growth-milestone.sh)
check_paths() {
  local repo="$1"; shift; local allowed=" $* "; local line path
  [[ -z "$(git -C "$repo" diff --cached --name-only)" ]] || return 1
  while IFS= read -r line; do
    path="${line:3}"
    [[ "$allowed" == *" $path "* ]] || return 1
  done < <(git -C "$repo" status --porcelain)
}
if ! check_paths "$BACKEND" "${BACKEND_FILES[@]}" || ! check_paths "$MOBILE" "${MOBILE_FILES[@]}"; then
  note 'Checkpoint skipped: unrelated or staged changes were found.'; exit 1
fi
git -C "$BACKEND" add -- "${BACKEND_FILES[@]}"
git -C "$MOBILE" add -- "${MOBILE_FILES[@]}"
if ! git -C "$BACKEND" diff --cached --quiet; then
  git -C "$BACKEND" commit -m 'checkpoint(6R): server coupons and checkout rewards' >"$LOG_DIR/backend-commit.log" 2>&1 || { note 'Backend checkpoint failed.'; exit 1; }
fi
if ! git -C "$MOBILE" diff --cached --quiet; then
  git -C "$MOBILE" commit -m 'checkpoint(6R): customer offers referral and loyalty' >"$LOG_DIR/mobile-commit.log" 2>&1 || { note 'Mobile checkpoint failed.'; exit 1; }
fi
note "Backend checkpoint: $(git -C "$BACKEND" rev-parse --short HEAD)"
note "Mobile checkpoint: $(git -C "$MOBILE" rev-parse --short HEAD)"
note "Report: $REPORT"
