# Driver Queue and Facility Delivery Reassignment

**Result:** COMPLETE  
**Environment:** Development/local only  
**Completed:** 2026-09-22 09:37 IST  
**Implementation checkpoint:** `7d479518aadd0e09ca8876795723bded3c680aaa`

## Issues confirmed before edits

1. **High — completed Driver assignments remained in active queues.**
   - Reproduction: sign in as Driver after finishing a pickup or delivery and open Today’s route.
   - Observed: completed cards remained under Pickup queue or Delivery queue and the action fell through to `Continue handoff`.
   - Root cause: the dashboard service intentionally merged same-day completed assignments into the queue response, while the mobile action-label fallback treated every unrecognized terminal state as actionable.

2. **Medium — Driver assignment context was incomplete.**
   - Reproduction: open the Driver dashboard or a job detail.
   - Observed: a card could show only the address; Order ID and assigned Facility were not consistently visible.
   - Root cause: both fields existed in the backend response but were not rendered consistently.

3. **High — Facility lost visibility while a delivery waited for Driver acceptance.**
   - Reproduction: complete Facility processing so an automatic delivery assignment is created.
   - Observed: the order changed from `ready_for_delivery` to `delivery_assigned` and disappeared from the Facility Ready tab before the Driver accepted it.
   - Root cause: the Facility dashboard and mobile Ready filter included only the literal `ready_for_delivery` state.

4. **High — Facility could not recover a Driver-rejected delivery.**
   - Reproduction: reject an assigned delivery as Driver.
   - Observed: the order changed to `delivery_failed`, disappeared from Ready, and Facility Staff had no reassignment action.
   - Root cause: Facility APIs did not expose eligible replacement Drivers or an authorization-scoped atomic reassignment operation.

## Changes made

- Driver pickup and delivery arrays now contain active assignments only. Completed work remains in the Completed summary metric for the current day.
- The Driver screen also filters completed assignments defensively, so stale responses cannot render completed cards.
- Driver dashboard cards and job details show the Order ID and assigned Facility.
- Facility Ready includes `ready_for_delivery`, `delivery_assigned`, and `delivery_failed`.
- `delivery_assigned` remains visible with `Waiting for Driver acceptance` until the Driver accepts it.
- `delivery_failed` remains visible with the rejection reason and a **Reassign Driver** action.
- Facility Staff can view eligible active and available Drivers, select a different Driver, and create the replacement assignment atomically.
- Reassignment is restricted to active staff at the order’s assigned Facility. Existing rejected assignments remain as audit history.

## Files changed

### Backend

- `backend/src/modules/drivers/drivers.service.ts`
- `backend/src/modules/drivers/drivers.service.spec.ts`
- `backend/src/modules/facility/facility.controller.ts`
- `backend/src/modules/facility/facility.service.ts`
- `backend/src/modules/facility/facility.dashboard.spec.ts`
- `backend/src/modules/facility/facility.reassignment.spec.ts`
- `backend/supabase/migrations/20260922090000_facility_delivery_reassignment.sql`

### Mobile

- `mobile/src/screens/DriverDashboardScreen.tsx`
- `mobile/src/screens/DriverDashboardScreen.test.tsx`
- `mobile/src/screens/DriverJobDetailScreen.tsx`
- `mobile/src/screens/DriverJobDetailScreen.test.tsx`
- `mobile/src/screens/FacilityDashboardScreen.tsx`
- `mobile/src/screens/FacilityDashboardScreen.test.tsx`
- `mobile/src/services/facilityDashboardApi.ts`

## Verification

- Backend targeted regressions: **24 passed**.
- Backend full unit regression: **48 suites / 293 tests passed**.
- Backend HTTP integration: **1 suite / 68 tests passed**.
- Backend build and strict ESLint: **passed**.
- Mobile targeted regressions: **3 suites / 26 tests passed** before the additional completed-card assertion.
- Mobile full regression: **79 suites / 229 tests passed**.
- Mobile TypeScript and strict ESLint: **passed**.
- Android Debug build: **passed**.
- iOS Simulator Debug build and installation: **passed**.
- Signed iOS Development build and provisioning check: **passed**.
- Secret scan: **passed**.
- Git whitespace review: **passed**.
- Local Supabase migration: **passed**.
- Rollback-only database transaction: the reassignment RPC created an assigned replacement delivery and moved the order from `delivery_failed` to `delivery_assigned`; all fixture changes were rolled back.

## Simulator smoke result

- **Android:** signed in with the local Driver account using local OTP. The dashboard showed `Completed 5` in the summary and only `Pickups 3` plus `Deliveries 1` in the active queues. No completed card was present. The active card showed its Order ID.
- **iOS:** the Driver dashboard showed the same corrected counts and active-only queues. Active cards showed Order ID and Facility.
- Android evidence: `reports/milestones/evidence/driver-queue-android-20260922-093727.png`
- iOS evidence: `reports/milestones/evidence/driver-queue-ios-20260922-093727.png`

## Remaining limitations

- Completed assignments remain available through the Completed summary count and backend audit history; the Driver active lists intentionally do not expose them.
- Facility reassignment appears only after a Driver rejects the delivery. Normal automatic assignment remains unchanged.
- React Native development builds display existing development warning banners; they do not affect release builds or the verified queue behavior.

## Environment and scope

- Production services touched: **NO**.
- Supabase: local only.
- OTP: local mock only.
- Maps, payment, and notifications: mock/local configuration.
- Driver and Facility workflow only; Customer and Admin behavior was not changed.
- 9J and Platform UAT were not started.
