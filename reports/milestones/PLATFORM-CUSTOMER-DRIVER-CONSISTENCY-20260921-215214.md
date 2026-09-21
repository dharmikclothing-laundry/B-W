# B&W Customer + Driver + Admin Consistency Fix

**Result:** COMPLETE  
**Environment:** Development/local only  
**Completed:** 2026-09-21 21:52 IST  
**Baseline:** `40a7a988ce6696671d82f8de66fafc18109fe87c`  
**Implementation checkpoint:** `ff43b2f40d727f9fa85b282b839c86ae0417ee90`

## Pre-change order and assignment audit

Order `BW-20260921-95FFAB54` exists in local Supabase as `6d1dd5e1-dd20-43c5-a1de-c5589cc3d965`. Its lifecycle status was and remains `confirmed`. It has an active stable order QR, no Facility assignment, and no pickup or delivery row in `driver_assignments`. Its recorded history is `draft → pending_payment → confirmed`.

Driver login `+16505550102` maps to the active Arjun Rao profile `14068884-1bf4-4646-b75b-2d2abc415ea6` and Driver record `69cbe656-cb94-4f2e-9c41-9239f6297f83`.

**Exact root cause:** the order was genuinely unassigned. The Driver dashboard query was returning the correct backend truth and was not filtering out an assignment. No assignment was fabricated. The workflow is now explicit: the dashboard says `No jobs assigned right now`, and authorized lookup returns `Assigned order not found` without exposing customer details.

## Completed behavior

### Driver QR and order lookup

- Driver QR scanner: **PASS**
- Driver order-number search: **PASS**
- Exact order-number and stable `BW1:<uuid>` QR payloads are supported.
- Wrong Driver protection: **PASS**
- Unassigned order protection: **PASS**
- Ineligible lifecycle protection: **PASS**
- Native scanner entry point is present; the iOS simulator safely displayed `QR scanner is unavailable on this device. Enter the order code instead.`
- Backend authorization remains authoritative. Arbitrary customer-order browsing is unavailable.

### Customer claims and refunds

- Claims visibility before delivery: **HIDDEN**
- Premature `claim window closed` copy before delivery: **HIDDEN**
- Claims visibility after delivery: **PASS**
- Existing post-delivery claim history: **PASS**
- Refund request visibility before eligibility: **HIDDEN**
- Eligible refund flow: **PASS**
- Completed refund status remains visible with no duplicate request action: **PASS**
- The payment summary now returns server-authoritative refund eligibility and remaining refundable amount.
- The database rejects direct customer refund requests unless the order is cancelled or in `claim_period_active`.

### Loyalty

The server-authoritative conversion is now:

- `1,000 points = ₹100`
- `2,000 points = ₹200`
- `950 points` is rejected because the minimum remains `1,000 points`
- `10 points = ₹1`

Checkout-only redemption and historical monetary snapshots remain unchanged. Backend calculations, mobile copy, Admin defaults, acceptance scripts, migrations, and documentation use the new conversion.

### Customer Home and order details

- Customer welcome: `Welcome <profile name>`
- Verified local result: `Welcome Tarun Reddy`
- Missing names fall back to `Welcome`.
- Session restore supports both the direct login profile and nested `/auth/me` profile shapes.
- Home has no service search bar.
- All 9 active backend categories render in a two-column grid on iOS and Android.
- Selecting a category shows backend-provided services; no catalogue records are hard-coded.
- Active catalogue verification: 131 services in 9 categories.
- The local mock map path no longer loads the external native Maps module during Development startup.
- Order Details preserves the order number, status, and visual QR.
- Lifecycle-specific care actions appear after the timeline; Receipt & Help remains at the end.
- Confirmed order `BW-20260921-95FFAB54` showed its visual QR with no Claim or Refund request action.

### Facility and visible data cleanup

- Facility name cleanup: `9C Fictional Facility 2 → Hyderabad Central Facility`
- Facility ID, relationships, assignments, processing history, and audit history were preserved.
- The active Admin display name was normalized to `Ananya Mehta`.
- Test/fixture terminology active-data scan: **PASS**
- Final scan result across active facilities, service categories, services, packages, and profiles: **0 matches** for fictional, fixture, test, milestone, or 7A–9J prefix terminology.

## E2E evidence

### Customer E2E: PASS

Android emulator acceptance completed:

`local OTP → session restore → Welcome Tarun Reddy → categories → service selection → cart → saved address → future pickup slot → order review → required-consent rejection → mock online payment → order success → visual QR → no premature Claim/Refund actions → history/detail → hardware Back → post-delivery claim history → fatal-log sweep`

Disposable E2E orders were cancelled through the local backend after acceptance. Their immutable cancellation and mock-refund audit histories were preserved.

iOS signed-simulator smoke completed:

- Home displayed `Welcome Tarun Reddy`.
- All 9 category cards were visible and no service search bar was present.
- Order `BW-20260921-95FFAB54` displayed a visual QR.
- No pre-delivery Claim or Refund request action appeared.
- Bottom navigation and logout/login worked.

### Driver E2E: PASS

- Login as `+16505550102` with local OTP.
- Dashboard displayed Assigned Jobs, Scan Order QR, Search Order, pickup queue, and delivery queue.
- Empty state displayed exactly `No jobs assigned right now`.
- Searching `BW-20260921-95FFAB54` returned `Assigned order not found` because it is unassigned.
- Simulator scanner fallback was safe and manual entry remained available.
- A disposable local assignment verified owner search by exact order number and QR payload, dashboard visibility, and wrong-Driver rejection. The disposable order and auth user were removed after the check.

### Admin verification: PASS

Admin Facility Oversight displayed `Hyderabad Central Facility`. The stale `9C Fictional Facility 2` label was absent.

## Automated gates

- Local/mock safety: **PASS**
- Local Supabase readiness: **PASS**, HTTP 200
- Order/assignment diagnostics: **PASS**
- Driver QR/order authorization targeted tests: **PASS**
- Claims/refund lifecycle targeted tests: **PASS**
- Loyalty calculation targeted tests: **PASS**
- Customer Home/profile targeted tests: **PASS**
- Backend targeted regression: **3 suites / 38 tests PASS**
- Backend full regression: **47 suites / 287 tests PASS**
- Backend HTTP E2E: **1 suite / 68 tests PASS**
- Backend build: **PASS**
- Backend strict ESLint: **PASS**
- Mobile full regression: **79 suites / 224 tests PASS**
- Mobile TypeScript: **PASS**
- Mobile strict ESLint: **PASS**
- Android Debug build: **PASS**, 470 Gradle tasks
- Android authenticated E2E: **PASS**
- iOS simulator Development build: **PASS**
- Signed iOS Development device build: **PASS**
- Signed iOS verification: **PASS**, identifier `com.brightwhitemobile.dev`, Team ID `97J7DWSN8Y`, valid on disk and satisfies its designated requirement
- Secret scan: **PASS**
- Protected-file verification: **PASS**; no `.env`, `local.properties`, Firebase private config, provisioning profile, or signing credential changed
- Git whitespace/diff review: **PASS**
- Active visible-name scan: **PASS**, 0 matches

Production readiness checks correctly report that Production API/Firebase/Maps/signing configuration is not staged. Those Production values were intentionally excluded from this Development-only task and were not required for the local Debug/Development gates.

## Files changed

### Backend

- `backend/docs/phase4_api_endpoints.md`
- `backend/scripts/9g-functional-acceptance.cjs`
- `backend/src/modules/drivers/driver-dashboard.controller.ts`
- `backend/src/modules/drivers/drivers.service.spec.ts`
- `backend/src/modules/drivers/drivers.service.ts`
- `backend/src/modules/drivers/dto/driver-order-lookup.dto.ts`
- `backend/src/modules/orders/dto/create-order.dto.ts`
- `backend/src/modules/orders/orders.service.spec.ts`
- `backend/src/modules/payments/payments.customer-flows.spec.ts`
- `backend/src/modules/payments/payments.service.ts`
- `backend/supabase/migrations/20260915100000_atomic_customer_cancellation_refunds.sql`
- `backend/supabase/migrations/20260920293000_9g_admin_growth_programs.sql`
- `backend/supabase/migrations/20260921200000_customer_driver_consistency.sql`
- `backend/test/app.e2e-spec.ts`

### Mobile

- `mobile/App.tsx`
- `mobile/scripts/growth-milestone.sh`
- `mobile/scripts/qa-authenticated-e2e.py`
- `mobile/src/components/LoyaltySection.test.tsx`
- `mobile/src/components/LoyaltySection.tsx`
- `mobile/src/components/OrderCareSection.test.tsx`
- `mobile/src/components/OrderCareSection.tsx`
- `mobile/src/screens/AdminGrowthScreen.test.tsx`
- `mobile/src/screens/AdminGrowthScreen.tsx`
- `mobile/src/screens/BenefitsScreen.test.tsx`
- `mobile/src/screens/BenefitsScreen.tsx`
- `mobile/src/screens/DriverDashboardScreen.test.tsx`
- `mobile/src/screens/DriverDashboardScreen.tsx`
- `mobile/src/screens/HomeScreen.test.tsx`
- `mobile/src/screens/HomeScreen.tsx`
- `mobile/src/screens/LocationPickerScreen.tsx`
- `mobile/src/screens/OrderDetailsScreen.tsx`
- `mobile/src/screens/OrderReviewScreen.test.tsx`
- `mobile/src/screens/OrderReviewScreen.tsx`
- `mobile/src/services/driverAssignmentsApi.test.ts`
- `mobile/src/services/driverAssignmentsApi.ts`
- `mobile/src/services/nativeQrScanner.test.ts`
- `mobile/src/services/nativeQrScanner.ts`
- `mobile/src/services/paymentsApi.ts`
- `mobile/src/services/profileApi.test.ts`
- `mobile/src/services/profileApi.ts`

## Remaining limitations

- Simulator/emulator environments cannot prove a physical camera scan. Native scanner entry, safe fallback, QR-payload resolution, and authorization were verified; physical-device camera acceptance remains a device-only check.
- Production readiness is intentionally not configured in this repository checkout. No Production credential or service was used.

## Safety and checkpoints

- Production Supabase touched: **NO**
- Production Firebase touched: **NO**
- Production Maps touched: **NO**
- Live Razorpay touched: **NO**
- Real SMS touched: **NO**
- Production services touched: **NO**
- Secrets committed: **NO**
- Backend checkpoint: `ff43b2f40d727f9fa85b282b839c86ae0417ee90`
- Mobile checkpoint: `ff43b2f40d727f9fa85b282b839c86ae0417ee90`

9J and Platform UAT were not started.
