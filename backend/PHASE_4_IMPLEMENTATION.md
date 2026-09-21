# Bright & White Backend – Phase 4

## Implemented modules

### Payments
- Razorpay order creation
- Amount conversion to paise
- Server-side payment signature verification
- Raw webhook HMAC verification
- Webhook idempotency
- Payment transactions
- Customer refund requests
- Admin approval flow foundation
- Financial audit records

### Packages
- Active package listing
- Monthly subscription creation
- Package usage retrieval

### Growth
- Coupon validation and discount calculation
- Referral registration with self-referral prevention
- Loyalty transaction history
- Loyalty redemption using a database balance function

### Notifications
- iOS/Android device token registration
- In-app notification persistence
- Notification listing and read status
- Queue-ready persistence model for push/SMS/WhatsApp workers

### Analytics
- Revenue
- Orders
- Driver performance
- Facility performance
- Machine utilization
- Reads the production analytics views defined by the master schema

### Production hardening delivered
- HMAC timing-safe comparisons
- Webhook idempotency
- Server-side provider credentials
- Signed upload architecture inherited from Phase 3
- Database audit trail integration
- Suggested supporting indexes and loyalty RPC

## Required environment variables

RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
GOOGLE_MAPS_SERVER_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
REDIS_URL=

## Before production go-live

1. Add exact `@Roles()` / `@Permissions()` checks to admin refund and analytics endpoints.
2. Use a dedicated webhook route with raw-body middleware.
3. Move push delivery to Firebase Cloud Messaging/APNs workers.
4. Add SMS/WhatsApp provider adapters and templates.
5. Add BullMQ retries and dead-letter queues.
6. Add API rate limiting at reverse proxy and NestJS layers.
7. Add distributed locks for financial operations.
8. Run integration tests against a Supabase staging project.
9. Perform security testing and load testing.
