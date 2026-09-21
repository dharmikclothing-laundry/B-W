# Google Maps and Razorpay configuration

Bright & White selects each external provider with an explicit mode. Local
development can run the complete backend without Google or Razorpay network
access. Production accepts only live mode and fails during startup when any
required credential is missing.

Keep credentials in `.env`. Git ignores that file. Never add credential values
to `.env.example`, source files, tests, logs, screenshots, or reports.

## Local development

Use these settings:

```env
NODE_ENV=development

GOOGLE_MAPS_MODE=mock
GOOGLE_MAPS_SERVER_KEY=

RAZORPAY_MODE=mock
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
```

When a mode is omitted in development or test, it defaults to `mock`. Setting
the modes explicitly is recommended because it makes the active behavior clear.

### Mock Google Maps

`MockMapsProvider` accepts the same coordinates as the live provider. It uses a
Haversine distance, a fixed road multiplier, and a fixed development speed. The
same coordinates always return the same distance and duration, identical points
return zero, and no external HTTP request is made.

The logistics flow uses this provider for driver scoring, pickup-to-facility
transit, and delivery navigation. The API response identifies the provider as
`mock`.

`scripts/mock-google-routes.cjs` remains available for isolated HTTP-contract
tests of the live adapter. Normal local runtime does not load that shim.

### Mock Razorpay

`MockPaymentProvider` keeps the provider boundary in memory while the normal
Bright & White payment service continues to enforce ownership, payment amount,
currency, database records, audit history, idempotency, and order lifecycle.
Amounts crossing the provider boundary remain in paise; database amounts remain
in rupees.

Create a payment order through the normal authenticated endpoint:

```text
POST /v1/payments/orders/:orderId/create
```

For a payment order owned by the signed-in customer, simulate a successful or
failed provider result with:

```text
POST /v1/payments/mock/:paymentOrderId/capture
POST /v1/payments/mock/:paymentOrderId/fail
```

The capture response contains the mock provider IDs and checkout signature.
Send those fields to the normal verification endpoint:

```text
POST /v1/payments/verify
```

Verification fetches the mock provider payment, checks its captured state,
amount, currency, and provider order, then records the payment and confirms the
order through the service-role-only atomic database path. A failed simulation
records a failed payment and leaves the order in `pending_payment`.

Mock simulation requires authentication and customer ownership. It returns
unavailable outside mock mode and can never run with `NODE_ENV=production`.

Refunds use the normal customer request and administrator approval endpoints:

```text
POST /v1/payments/refunds/:paymentOrderId/request
POST /v1/payments/refunds/:refundId/approve
```

Mock refunds return a unique `mock_refund_...` identifier and reuse the same
identifier when the same refund reference is replayed. The database claim and
completion functions prevent duplicate provider calls and duplicate ledger or
audit effects. If a provider succeeds while database recording is interrupted,
the next administrator retry reconciles the existing provider refund by the
refund-request reference before considering any further provider action.

### Signed webhook tests

To exercise the existing raw-body signature path locally, put a development-only
secret in the ignored `.env` file:

```env
RAZORPAY_WEBHOOK_SECRET=<local-development-value>
```

Sign the exact request bytes with HMAC-SHA256 and send the hexadecimal digest in
`X-Razorpay-Signature`. Use a stable unique event ID in
`X-Razorpay-Event-Id` when testing replay behavior. Correct signatures are
accepted, incorrect signatures are rejected before database access, and an
event replay cannot duplicate payment or refund effects. Concurrent delivery
while another worker owns the event returns a retryable error; an abandoned
processing lease can be reclaimed, while an already processed event returns an
idempotent duplicate response.

## Live providers

Use the following shape in production secrets management:

```env
NODE_ENV=production

GOOGLE_MAPS_MODE=live
GOOGLE_MAPS_SERVER_KEY=<required>

RAZORPAY_MODE=live
RAZORPAY_KEY_ID=<required>
RAZORPAY_KEY_SECRET=<required>
RAZORPAY_WEBHOOK_SECRET=<required>
```

For Google Cloud, enable Routes API and restrict the server key to the API and
the backend's deployed egress identity or IP policy. In live mode the existing
Google Routes request, traffic-aware routing, timeout, response validation, and
controlled error mapping remain active.

For Razorpay, use Test Mode keys in non-production environments when testing the
real integration. Configure `/v1/payments/webhook/razorpay` for
`payment.captured`, `payment.failed`, `refund.processed`, and `refund.failed`.
The webhook secret is separate from the API key secret. The backend verifies the
signature against the exact raw request bytes before any persistence.

Production startup fails when either mode is missing, either mode is `mock`, the
Google key is missing in live mode, or any Razorpay credential is missing in
live mode. There is no credential-based fallback to mock behavior.

## Diagnostics and tests

The public readiness endpoint stays minimal and never exposes provider details.
Authenticated administrators and managers can inspect the safe provider state:

```text
GET /v1/admin/diagnostics/providers
```

It returns only the node environment, each provider mode, and a configured
boolean. It never returns keys or secrets.

Run local provider tests without network access:

```bash
npm run test:providers
```

Run the full automated suite:

```bash
npm run lint
npm run build
npm test
npm run test:e2e
```

The separate live credential check intentionally contacts Google and Razorpay:

```bash
npm run test:providers:live
```

It refuses non-test Razorpay keys unless explicitly overridden. Run it only when
valid local credentials are present and live-provider validation is intended.
