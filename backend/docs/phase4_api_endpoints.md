# Phase 4 API Endpoints

## Payments
- POST `/v1/payments/orders/:orderId/create`
- POST `/v1/payments/verify`
- POST `/v1/payments/webhook/razorpay`
- POST `/v1/payments/refunds/:paymentOrderId/request`
- POST `/v1/payments/refunds/:refundId/approve`

## Packages
- GET `/v1/packages`
- POST `/v1/packages/:id/subscribe`
- GET `/v1/packages/me/usage`

## Growth
- GET `/v1/growth/offers`
- POST `/v1/growth/coupon`
- GET `/v1/growth/referral`
- POST `/v1/growth/referral`
- GET `/v1/growth/loyalty`
- POST `/v1/orders` with optional `couponCode` and `loyaltyPointsToRedeem`

Loyalty points are worth ₹0.01 each, with a minimum redemption of 1,000 points
(₹10). Redemption is a checkout discount in the
atomic order creation flow; standalone redemption is unavailable.
Eligible orders earn 0.01 point per ₹1 paid, rounded down to whole points after
payment and delivery. Cash on delivery is treated as paid at delivery.

## Notifications
- POST `/v1/notifications/devices`
- GET `/v1/notifications`
- POST `/v1/notifications/:id/read`

## Analytics
- GET `/v1/admin/analytics/dashboard`
