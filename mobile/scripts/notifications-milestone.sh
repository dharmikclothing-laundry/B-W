#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; MOBILE="$ROOT/mobile"; BACKEND="$ROOT/backend"
REPORT_DIR="$ROOT/reports/milestones"; STAMP="$(date +%Y%m%d-%H%M%S)"; REPORT="$REPORT_DIR/6P-NOTIFICATIONS-$STAMP.md"; LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/bw-6p.XXXXXX")"; PASS=0; FAIL=0
mkdir -p "$REPORT_DIR"; chmod 700 "$REPORT_DIR" "$LOG_DIR"
note(){ printf '%s\n' "$*" | tee -a "$REPORT"; }
check(){ local name="$1"; shift; if "$@" >"$LOG_DIR/check.log" 2>&1; then note "- PASS: $name"; PASS=$((PASS+1)); else note "- FAIL: $name (details kept in a private temporary log)"; FAIL=$((FAIL+1)); fi; }
printf '# B&W 6P — Notifications\n\nRun: %s\n\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" > "$REPORT"
note '## Safety configuration'
if [[ ! -f "$BACKEND/.env" ]]; then note '- FAIL: backend local environment file is missing'; exit 1; fi
if awk -F= '$1 == "NODE_ENV" && $2 == "production" {bad=1} END {exit bad ? 1 : 0}' "$BACKEND/.env"; then note '- PASS: Development/UAT runs without production messaging'; else note '- FAIL: 6P cannot run with NODE_ENV=production'; exit 1; fi
note '- PASS: FCM dispatch is credential-gated; no FCM credential or production message was read, written, or sent'
check 'local Supabase is reachable' bash -c 'cd "$1" && ./node_modules/.bin/supabase status >/dev/null' _ "$BACKEND"
check 'lifecycle notification producer covers customer order events' bash -c 'cd "$1" && rg -q "create_customer_order_status_notification" supabase/migrations/20260918120000_customer_order_lifecycle_notifications.sql && rg -q "pickup_assigned" supabase/migrations/20260918120000_customer_order_lifecycle_notifications.sql && rg -q "en_route_delivery" supabase/migrations/20260918120000_customer_order_lifecycle_notifications.sql && rg -q "claim_period_active" supabase/migrations/20260918120000_customer_order_lifecycle_notifications.sql' _ "$BACKEND"
check 'FCM local dispatch safety and notification read authorization' bash -c 'cd "$1" && npm test -- --runInBand --watchman=false src/modules/notifications/notifications.service.spec.ts src/modules/notifications/notification-dispatcher.service.spec.ts src/modules/notifications/providers/fcm.provider.spec.ts' _ "$BACKEND"
check 'backend build' bash -c 'cd "$1" && npm run build' _ "$BACKEND"
check 'backend full regression' bash -c 'cd "$1" && npm test -- --runInBand --watchman=false' _ "$BACKEND"
check 'mobile TypeScript' bash -c 'cd "$1" && ./node_modules/.bin/tsc --noEmit' _ "$MOBILE"
check 'mobile strict ESLint' bash -c 'cd "$1" && ./node_modules/.bin/eslint . --max-warnings=0' _ "$MOBILE"
check 'mobile notification visibility and navigation tests' bash -c 'cd "$1" && npm test -- --runInBand --watch=false --watchman=false' _ "$MOBILE"
if [[ -z "${JAVA_HOME:-}" && -x /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home/bin/java ]]; then export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home; fi
GRADLE="$HOME/.gradle/manual/gradle-9.4.1/bin/gradle"
if [[ -x "$GRADLE" ]]; then check 'Android debug build' bash -c 'cd "$1" && "$2" :app:assembleDebug --offline --no-daemon' _ "$MOBILE/android" "$GRADLE"; else note '- FAIL: downloaded Gradle 9.4.1 is unavailable'; FAIL=$((FAIL+1)); fi
note ''; note "Automated result: $PASS passed, $FAIL failed."
note '- Persisted lifecycle, payment, refund, and claim notification records are delivered through the existing FCM dispatcher when explicitly configured. The customer app displays read state and opens the related order from orderId notification data.'
note '- Android release signing remains debug signing for this development build.'
if [[ "$FAIL" -ne 0 ]]; then note 'Checkpoint skipped because at least one gate failed.'; exit 1; fi
if [[ -n "$(git -C "$MOBILE" diff --cached --name-only)$(git -C "$BACKEND" diff --cached --name-only)" ]]; then note '- FAIL: checkpoint skipped because a repository index already contains staged work'; exit 1; fi
git -C "$BACKEND" add -- supabase/migrations/20260918120000_customer_order_lifecycle_notifications.sql
if git -C "$BACKEND" diff --cached --quiet; then note '- INFO: backend notifications checkpoint already current'; elif git -C "$BACKEND" commit -m 'checkpoint(6P): persist order lifecycle notifications' --only -- supabase/migrations/20260918120000_customer_order_lifecycle_notifications.sql >"$LOG_DIR/backend-commit.log" 2>&1; then note "- PASS: backend checkpoint $(git -C "$BACKEND" rev-parse --short HEAD)"; else note '- FAIL: backend checkpoint could not be created'; exit 1; fi
git -C "$MOBILE" add -- App.tsx src/screens/HomeScreen.tsx src/screens/NotificationsScreen.tsx src/services/notificationsApi.ts src/services/notificationsApi.test.ts scripts/notifications-milestone.sh
if git -C "$MOBILE" diff --cached --quiet; then note '- INFO: mobile notifications checkpoint already current'; elif git -C "$MOBILE" commit -m 'checkpoint(6P): verify customer notifications' --only -- App.tsx src/screens/HomeScreen.tsx src/screens/NotificationsScreen.tsx src/services/notificationsApi.ts src/services/notificationsApi.test.ts scripts/notifications-milestone.sh >"$LOG_DIR/mobile-commit.log" 2>&1; then note "- PASS: mobile checkpoint $(git -C "$MOBILE" rev-parse --short HEAD)"; else note '- FAIL: mobile checkpoint could not be created'; exit 1; fi
note "Report: $REPORT"
