# Phase 3 API Endpoints

## Driver
- PATCH `/v1/drivers/me/availability`
- POST `/v1/drivers/me/location`
- GET `/v1/drivers/me/nearby-jobs`

## Assignment
- POST `/v1/orders/:orderId/assign-driver`
- POST `/v1/driver-assignments/:assignmentId/accept`
- POST `/v1/driver-assignments/:assignmentId/reject`
- POST `/v1/driver-assignments/:assignmentId/navigation`

## Facility
- POST `/v1/facility/receive/qr`
- POST `/v1/facility/orders/:orderId/verify`
- POST `/v1/facility/orders/:orderId/processing`
- POST `/v1/facility/operations/:operationId/complete`
- POST `/v1/facility/orders/:orderId/quality-check`

## Delivery
- POST `/v1/orders/:orderId/assign-delivery`
- POST `/v1/orders/:orderId/delivery-proof/upload-url`
- POST `/v1/orders/:orderId/complete-delivery`
