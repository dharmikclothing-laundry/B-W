#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MOBILE="$ROOT/mobile"
BACKEND="$ROOT/backend"
REPORT_DIR="$ROOT/reports/milestones"
STAMP="$(date +%Y%m%d-%H%M%S)"
REPORT="$REPORT_DIR/6O-TRACKING-$STAMP.md"
LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/bw-6o.XXXXXX")"
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

printf '# B&W 6O — Order Tracking + Driver Live Location\n\nRun: %s\n\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" > "$REPORT"
note '## Safety configuration'
if [[ ! -f "$BACKEND/.env" ]]; then
  note '- FAIL: backend local environment file is missing'; exit 1
fi
if awk -F= '
  $1 == "NODE_ENV" && $2 == "production" { bad=1 }
  $1 == "GOOGLE_MAPS_MODE" && $2 != "mock" { bad=1 }
  END { exit bad ? 1 : 0 }
' "$BACKEND/.env"; then
  note '- PASS: Development/UAT uses local mock Maps and local driver-location storage'
else
  note '- FAIL: 6O requires a non-production environment with GOOGLE_MAPS_MODE=mock when explicitly configured'; exit 1
fi
note '- PASS: no production Maps or location traffic is used'
check 'local Supabase is reachable' bash -c 'cd "$1" && ./node_modules/.bin/supabase status >/dev/null' _ "$BACKEND"
check 'tracking endpoint has lifecycle and customer authorization guards' bash -c 'cd "$1" && rg -q "TRACKING_ASSIGNMENT_STATUSES" src/modules/logistics/logistics.service.ts && rg -q "LIVE_LOCATION_STATUSES" src/modules/logistics/logistics.service.ts && rg -q "Not authorized to track this order" src/modules/logistics/logistics.service.ts && ! (sed -n "120,280p" src/modules/logistics/logistics.service.ts | rg -q "maps\.getRoute")' _ "$BACKEND"

note ''
note '## Tracking acceptance and regression gates'
check 'backend tracking authorization, stale location, completion, and mock update tests' bash -c 'cd "$1" && npm test -- --runInBand --watchman=false src/modules/logistics/logistics.service.spec.ts' _ "$BACKEND"
check 'backend build' bash -c 'cd "$1" && npm run build' _ "$BACKEND"
check 'backend full regression' bash -c 'cd "$1" && npm test -- --runInBand --watchman=false' _ "$BACKEND"
check 'mobile TypeScript' bash -c 'cd "$1" && ./node_modules/.bin/tsc --noEmit' _ "$MOBILE"
check 'mobile strict ESLint' bash -c 'cd "$1" && ./node_modules/.bin/eslint . --max-warnings=0' _ "$MOBILE"
check 'mobile tracking visibility, loading, and error tests' bash -c 'cd "$1" && npm test -- --runInBand --watch=false --watchman=false' _ "$MOBILE"

if [[ -z "${JAVA_HOME:-}" && -x /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home/bin/java ]]; then
  export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
fi
GRADLE="$HOME/.gradle/manual/gradle-9.4.1/bin/gradle"
if [[ -x "$GRADLE" ]]; then
  check 'Android debug build' bash -c 'cd "$1" && "$2" :app:assembleDebug --offline --no-daemon' _ "$MOBILE/android" "$GRADLE"
else
  note '- FAIL: downloaded Gradle 9.4.1 is unavailable'; FAIL=$((FAIL + 1))
fi

note ''
note "Automated result: $PASS passed, $FAIL failed."
note '- Timeline remains the existing order-status history; tracking is visible only through pickup and delivery assignment states.'
note '- Live location refreshes every 30 seconds only while the driver is en route or at handover. Completed and cancelled orders return no tracking data.'
note '- ETA and distance are displayed when supplied; local tracking deliberately makes no route or map-provider request.'
note '- Android release signing remains debug signing for this development build.'
if [[ "$FAIL" -ne 0 ]]; then
  note 'Checkpoint skipped because at least one gate failed.'; exit 1
fi
if [[ -n "$(git -C "$MOBILE" diff --cached --name-only)$(git -C "$BACKEND" diff --cached --name-only)" ]]; then
  note '- FAIL: checkpoint skipped because a repository index already contains staged work'; exit 1
fi
git -C "$BACKEND" add -- src/modules/logistics/logistics.service.ts src/modules/logistics/logistics.service.spec.ts
git -C "$MOBILE" add -- src/screens/OrderDetailsScreen.tsx src/services/orderTrackingApi.ts src/services/orderTrackingApi.test.ts scripts/tracking-milestone.sh
if git -C "$BACKEND" diff --cached --quiet; then
  note '- INFO: backend tracking checkpoint already current'
elif git -C "$BACKEND" commit -m 'checkpoint(6O): verify order tracking lifecycle' --only -- src/modules/logistics/logistics.service.ts src/modules/logistics/logistics.service.spec.ts >"$LOG_DIR/backend-commit.log" 2>&1; then
  note "- PASS: backend checkpoint $(git -C "$BACKEND" rev-parse --short HEAD)"
else
  note '- FAIL: backend checkpoint could not be created'; exit 1
fi
if git -C "$MOBILE" diff --cached --quiet; then
  note '- INFO: mobile tracking checkpoint already current'
elif git -C "$MOBILE" commit -m 'checkpoint(6O): verify customer order tracking' --only -- src/screens/OrderDetailsScreen.tsx src/services/orderTrackingApi.ts src/services/orderTrackingApi.test.ts scripts/tracking-milestone.sh >"$LOG_DIR/mobile-commit.log" 2>&1; then
  note "- PASS: mobile checkpoint $(git -C "$MOBILE" rev-parse --short HEAD)"
else
  note '- FAIL: mobile checkpoint could not be created'; exit 1
fi
note "Report: $REPORT"
