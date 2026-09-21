# Bright & White Backend – Phase 3

This implementation adds:

1. Driver availability management
2. Real-time driver GPS updates
3. PostGIS candidate discovery
4. Google Routes API ETA and distance scoring
5. Workload-aware driver selection
6. Driver assignment
7. Acceptance/rejection workflow
8. Nearby job lookup
9. Navigation event recording
10. Facility QR receiving
11. Garment/order verification
12. Laundry processing operations
13. Quality control
14. Delivery assignment
15. Signed delivery-proof uploads
16. Mandatory photo + OTP delivery completion
17. Seven-day claim period through the master status engine
18. BullMQ assignment worker
19. Automated unit-test foundation

## Required deployment order

1. Deploy `bright_white_master_schema_v1_0.sql`.
2. Apply `database/phase3_required_rpc_functions.sql`.
3. Run `npm install`.
4. Configure Supabase, Redis and Google Maps environment variables.
5. Run tests.
6. Start API and worker processes.

## Production hardening still required

- Replace permissive controller access with exact RBAC permission decorators for every facility/admin operation.
- Configure signed Storage policies for delivery proof objects.
- Add Redis distributed locks around assignment retries.
- Add assignment acceptance timeout and retry scheduler.
- Validate geofence distance at pickup and delivery.
- Add virus/image scanning if required by security policy.
- Integrate real push notifications into assignment events.
