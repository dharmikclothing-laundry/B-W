# Driver Assignment and Customer Outcome Completion

**Completed:** 2026-09-22 12:19 IST  
**Environment:** Development/local only  
**Implementation checkpoint:** `f38f8248ffab7a8f374ff9d8debfaa036bf90d93`  
**Production services touched:** NO

## Result

Driver assignment rejection and customer-unavailable handling now preserve the order lifecycle required by operations:

- Rejecting an offered pickup or delivery assignment does not cancel the order. The rejected assignment is closed and the order is offered to the next eligible available Driver.
- A Driver can report `Customer not at home` or `Customer not answering` only after reaching the customer and marking the assignment arrived.
- For pickup assignments, either customer-unavailable outcome cancels the order through the existing atomic customer-cancellation path. The cancellation is visible in the Customer app and retains the existing refund and loyalty-restoration behavior.
- For delivery assignments, either outcome keeps the order active, changes it to delivery failed, schedules it for the next India-local day, and creates a Customer notification.
- Delivery customer-unavailable handling never cancels the order.
- Future pickup orders are not assigned early. Same-day paid pickups are assigned immediately, while future-day pickups are dispatched when their India-local service day begins. A 15-minute recovery run handles delayed application startup or timer execution.
- The Driver dashboard shows only today's offered pickups, ordered by earliest pickup slot. Accepted or in-progress pickup work remains visible until completion. Delivery jobs are ordered by assignment/ready time.

## Confirmed issues and root causes

1. **Assignment rejection cancelled the operational path instead of continuing dispatch.** The rejection endpoint only closed the current assignment and left no automatic next-driver action. Candidate selection also did not exclude Drivers who had already rejected the same order and assignment type.
2. **Customer-unavailable handling had no role-aware workflow.** There was no atomic server operation enforcing arrival, assignment ownership, valid reasons, or different pickup and delivery consequences.
3. **Pickup dispatch ignored the service date.** Payment capture immediately assigned every paid pickup, including future-day orders, and there was no India-local daily dispatch process.
4. **Driver queue order and visibility did not match daily operations.** Offered future pickups could appear and sorting did not prioritize pickup slot time or delivery readiness.
5. **The Customer app had no explicit rescheduled-delivery presentation.** The next delivery attempt time was not part of the order response or shown in order details.

## Files changed

- `backend/src/modules/drivers/drivers.service.ts`
- `backend/src/modules/drivers/drivers.service.spec.ts`
- `backend/src/modules/logistics/assignment-scheduler.service.ts`
- `backend/src/modules/logistics/dto/report-customer-unavailable.dto.ts`
- `backend/src/modules/logistics/logistics.controller.ts`
- `backend/src/modules/logistics/logistics.module.ts`
- `backend/src/modules/logistics/logistics.service.ts`
- `backend/src/modules/logistics/logistics.assignments.spec.ts`
- `backend/src/modules/payments/payments.service.ts`
- `backend/src/modules/payments/payments.service.spec.ts`
- `backend/supabase/migrations/20260922100000_driver_customer_outcomes_and_daily_dispatch.sql`
- `mobile/src/screens/DriverJobDetailScreen.tsx`
- `mobile/src/screens/DriverJobDetailScreen.test.tsx`
- `mobile/src/screens/OrderDetailsScreen.tsx`
- `mobile/src/services/driverAssignmentsApi.ts`
- `mobile/src/types/order.ts`

## Verification

- Backend targeted assignment/payment/driver tests: 38 passed.
- Driver mobile component tests: 20 passed.
- Full backend regression: 48 suites, 298 tests passed.
- Backend HTTP integration: 68 tests passed.
- Full mobile regression: 79 suites, 231 tests passed.
- Backend lint and build: passed.
- Mobile strict ESLint and TypeScript: passed.
- Android Debug build: passed.
- Signed iOS Development device build: passed.
- Secret scan: passed.
- Git whitespace review: passed.

Rollback-only local database smoke tests proved both branches without retaining fixture changes:

- Delivery customer unavailable: assignment became cancelled, order became `delivery_failed`, next attempt was scheduled for `2026-09-23 00:00 IST`, and a Customer notification was inserted.
- Pickup customer unavailable: assignment and order became cancelled, the existing refund request was created for the paid amount, and a Customer notification was inserted.
- Scheduler startup found and assigned a due local job.

## Remaining limitation

During the final interactive iOS Simulator reload, the development client remained on a loading state even though the rebuilt local backend stayed healthy. The new controls were therefore verified through mobile component tests, backend integration tests, signed iOS/Android builds, and rollback-only local database smokes rather than a final device-visible interaction. Existing development Fast Refresh/runtime connectivity should be reloaded before the next manual device session.

No 9J or Platform UAT was started.
