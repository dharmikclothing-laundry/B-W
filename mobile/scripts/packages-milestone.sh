#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MOBILE="$ROOT/mobile"
BACKEND="$ROOT/backend"
REPORT_DIR="$ROOT/reports/milestones"
REPORT="$REPORT_DIR/6S-PACKAGES-SUBSCRIPTIONS-$(date +%Y%m%d-%H%M%S).md"
LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/bw-6s.XXXXXX")"
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
    tail -20 "$LOG_DIR/gate.log" >&2
  fi
}
printf '# B&W 6S — Packages & Subscriptions\n\nRun: %s\n\n## Acceptance gates\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" > "$REPORT"
gate 'Development/UAT local and mock provider safety' bash -c '
  awk -F= '\''
    {key=$1; value=$2; gsub(/^[[:space:]]+|[[:space:]]+$/, "", key); gsub(/^[[:space:]]+|[[:space:]]+$/, "", value);
     if(key=="NODE_ENV" && value=="production") bad=1;
     if(key=="RAZORPAY_MODE" && value!="mock") bad=1;
     if(key=="SUPABASE_URL" && value!~/localhost|127[.]0[.]0[.]1/) bad=1;}
    END {exit bad ? 1 : 0}
  '\'' "$1/.env"
' _ "$BACKEND"
if [[ "$FAIL" -ne 0 ]]; then note 'Checkpoint skipped: local safety gate failed.'; exit 1; fi
gate 'local Supabase readiness' bash -c 'cd "$1" && ./node_modules/.bin/supabase status >/dev/null' _ "$BACKEND"
gate 'local package migration and atomic usage tests' bash -c 'cd "$1" && ./node_modules/.bin/supabase migration up --local --yes >/dev/null && ./node_modules/.bin/supabase test db --local supabase/tests/6s_package_usage.sql' _ "$BACKEND"
gate 'backend package payment tests' bash -c 'cd "$1" && npm test -- --runInBand --watchman=false src/modules/packages/packages.service.spec.ts' _ "$BACKEND"
gate 'backend full regression' bash -c 'cd "$1" && npm test -- --runInBand --watchman=false' _ "$BACKEND"
gate 'backend build and strict ESLint' bash -c 'cd "$1" && npm run build && ./node_modules/.bin/eslint src test --max-warnings=0' _ "$BACKEND"
gate 'mobile package API and checkout tests' bash -c 'cd "$1" && npm test -- --runInBand --watch=false --watchman=false src/services/packagesApi.test.ts src/utils/packagePricing.test.ts src/screens/OrderReviewScreen.test.tsx' _ "$MOBILE"
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
gate 'protected files and release signing untouched' bash -c '
  ! git -C "$1" status --porcelain | grep -E "android/local[.]properties|android/app/build[.]gradle|[.]env" &&
  ! git -C "$2" status --porcelain | grep -E "[.]env|supabase/config[.]toml"
' _ "$MOBILE" "$BACKEND"
note ''
note "Automated result: $PASS passed, $FAIL failed."
note 'Purchase and renewal use captured mock payment only; production package purchase is blocked until a configured live flow exists.'
note 'Package usage is deducted atomically by the server with subscription locks; cancelled orders restore credits.'
note 'Development/UAT used local Supabase and no real payment activity.'
if [[ "$FAIL" -ne 0 ]]; then note 'Checkpoint skipped because at least one gate failed.'; exit 1; fi
BACKEND_FILES=(src/modules/payments/payments.module.ts src/modules/packages/packages.module.ts src/modules/packages/packages.controller.ts src/modules/packages/packages.service.ts src/modules/packages/packages.service.spec.ts src/modules/orders/orders.module.ts src/modules/orders/orders.service.ts src/modules/orders/dto/create-order.dto.ts supabase/migrations/20260918170000_6s_package_purchase_usage.sql supabase/migrations/20260918180000_6s_atomic_package_order.sql supabase/tests/6s_package_usage.sql)
MOBILE_FILES=(App.tsx src/navigation/types.ts src/types/order.ts src/screens/HomeScreen.tsx src/screens/OrderReviewScreen.tsx src/screens/OrderReviewScreen.test.tsx src/screens/PackagesScreen.tsx src/screens/PackageDetailScreen.tsx src/components/PackageCheckoutSection.tsx src/services/packagesApi.ts src/services/packagesApi.test.ts src/utils/packagePricing.ts src/utils/packagePricing.test.ts scripts/packages-milestone.sh)
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
  git -C "$BACKEND" commit -m 'checkpoint(6S): atomic package purchase and usage' >"$LOG_DIR/backend-commit.log" 2>&1 || { note 'Backend checkpoint failed.'; exit 1; }
fi
if ! git -C "$MOBILE" diff --cached --quiet; then
  git -C "$MOBILE" commit -m 'checkpoint(6S): customer packages and checkout credits' >"$LOG_DIR/mobile-commit.log" 2>&1 || { note 'Mobile checkpoint failed.'; exit 1; }
fi
note "Backend checkpoint: $(git -C "$BACKEND" rev-parse --short HEAD)"
note "Mobile checkpoint: $(git -C "$MOBILE" rev-parse --short HEAD)"
note "Report: $REPORT"
