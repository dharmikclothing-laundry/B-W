#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MOBILE="$ROOT/mobile"
BACKEND="$ROOT/backend"
REPORT_DIR="$ROOT/reports/milestones"
REPORT="$REPORT_DIR/6T-PROFILE-SUPPORT-HISTORY-$(date +%Y%m%d-%H%M%S).md"
LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/bw-6t.XXXXXX")"
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
printf '# B&W 6T — Profile, Support, Receipts & History\n\nRun: %s\n\n## Acceptance gates\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" > "$REPORT"
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
gate 'backend profile validation tests' bash -c 'cd "$1" && npm test -- --runInBand --watchman=false src/modules/customers/dto/customer.dto.spec.ts' _ "$BACKEND"
gate 'backend full regression' bash -c 'cd "$1" && npm test -- --runInBand --watchman=false' _ "$BACKEND"
gate 'backend build and strict ESLint' bash -c 'cd "$1" && npm run build && ./node_modules/.bin/eslint src test --max-warnings=0' _ "$BACKEND"
gate 'mobile profile, receipt, history, reorder and session tests' bash -c 'cd "$1" && npm test -- --runInBand --watch=false --watchman=false src/services/profileApi.test.ts src/services/sessionManager.test.ts src/utils/orderHistory.test.ts src/utils/reorder.test.ts src/utils/contactValidation.test.ts src/screens/ProfileScreen.test.tsx src/screens/ReceiptScreen.test.tsx' _ "$MOBILE"
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
note 'Customer name editing reuses the existing customer API; verified phone remains read-only and account email is not stored by the current backend.'
note 'Historical orders show a server-derived receipt and GST breakdown. Formal tax invoices are unavailable because the current billing contract has no invoice number or merchant tax identity.'
note 'Support call, WhatsApp and email actions appear only when public contact details are configured.'
note 'Development/UAT used local Supabase and mock providers; no production payment or messaging activity.'
if [[ "$FAIL" -ne 0 ]]; then note 'Checkpoint skipped because at least one gate failed.'; exit 1; fi
BACKEND_FILES=(src/modules/customers/dto/customer.dto.ts src/modules/customers/dto/customer.dto.spec.ts)
MOBILE_FILES=(App.tsx __tests__/App.test.tsx src/navigation/types.ts src/screens/AddressScreen.tsx src/screens/HomeScreen.tsx src/screens/OrderDetailsScreen.tsx src/screens/OrdersScreen.tsx src/screens/ProfileScreen.tsx src/screens/ProfileScreen.test.tsx src/screens/ReceiptScreen.tsx src/screens/ReceiptScreen.test.tsx src/screens/SupportScreen.tsx src/services/profileApi.ts src/services/profileApi.test.ts src/services/sessionManager.test.ts src/utils/contactValidation.ts src/utils/contactValidation.test.ts src/utils/orderHistory.ts src/utils/orderHistory.test.ts src/utils/reorder.ts src/utils/reorder.test.ts scripts/customer-polish-milestone.sh)
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
  git -C "$BACKEND" commit -m 'checkpoint(6T): validate customer profile names' >"$LOG_DIR/backend-commit.log" 2>&1 || { note 'Backend checkpoint failed.'; exit 1; }
fi
if ! git -C "$MOBILE" diff --cached --quiet; then
  git -C "$MOBILE" commit -m 'checkpoint(6T): profile support receipts and history' >"$LOG_DIR/mobile-commit.log" 2>&1 || { note 'Mobile checkpoint failed.'; exit 1; }
fi
note "Backend checkpoint: $(git -C "$BACKEND" rev-parse --short HEAD)"
note "Mobile checkpoint: $(git -C "$MOBILE" rev-parse --short HEAD)"
note "Report: $REPORT"
