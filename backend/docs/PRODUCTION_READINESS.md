# Bright & White Phase 5 Production Readiness

## Consolidation status
Phase 1–4 backend modules are retained in a single repository. AppModule now imports:
Auth, RBAC, Customers, Orders, QR, OTP, Health, Payments, Maps, Drivers,
Notifications, Packages, Growth, Analytics, Queues and Production modules.

## Dependency conflict resolution
1. Global API prefix is `/v1`; controllers must not duplicate `/v1`.
2. Phase 4 Packages/Growth/Analytics modules are explicitly imported.
3. Provider secrets remain backend-only.
4. Webhook requests require raw-body signature verification.
5. Financial and assignment concurrency requires Redis locking.
6. Supabase RLS remains the database authorization boundary; backend service role bypasses RLS and must enforce RBAC.

## Environments
Use separate Supabase projects, Razorpay credentials, Firebase projects and secrets for:
- development
- staging
- production

## Backups and recovery
- Enable Supabase backups/PITR according to the selected plan.
- Export schema and migration history to version control.
- Test restore in a non-production project quarterly.
- Record RPO and RTO and assign a recovery owner.

## Store readiness
### Apple
- Apple Developer membership
- Bundle ID and signing certificates
- Privacy nutrition labels
- Push notification entitlement
- App privacy policy and support URL
- TestFlight validation

### Google Play
- Play Console account
- Android application ID and signing
- Data safety form
- Privacy policy
- Closed testing track
- Production rollout review

## Mandatory go-live gates
- All migrations applied to staging
- Automated tests passing
- Load tests completed
- Dependency/security scan passing
- Refund/admin RBAC tested
- OTP abuse limits tested
- Backup restore tested
- Crash/error monitoring verified
- Payment webhook replay tested
- Push/SMS/WhatsApp delivery tested
