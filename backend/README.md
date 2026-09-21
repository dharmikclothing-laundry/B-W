# Bright & White Backend

Executable NestJS/TypeScript production-oriented starter backend.

## Quick start

```bash
cp .env.example .env
npm install
npm run start:dev
```

Open Swagger at `http://localhost:3000/docs`.

## Important schema contract

This repository expects the consolidated Bright & White Supabase schema. Before production deployment, align exact table/column names and enum values with `bright_white_master_schema_v1_0.sql`.

## Current implementation

- NestJS API
- Supabase service client
- Order creation and retrieval
- Razorpay order/signature logic
- Google Maps Directions request
- Driver GPS upsert
- Redis/BullMQ queue foundation
- Notification queue API
- Docker configuration
- Automated Jest tests

## Required next implementation steps

1. Add JWT guards based on Supabase Auth.
2. Replace temporary body driverId values with authenticated user context.
3. Add exact repository contracts matching every finalized database table.
4. Add webhook raw-body handling.
5. Add BullMQ workers and notification providers.
6. Implement QR, OTP, assignment and facility modules.
7. Add integration and end-to-end tests.


# Phase 2 implementation

This repository now includes executable NestJS modules mapped directly to `bright_white_master_schema_v1_0.sql`:

- Phone OTP authentication through Supabase Auth
- Automatic profile/customer bootstrap
- RBAC using `profiles`, `roles`, `profile_roles`, `permissions`, `role_permissions`
- Customer profile and `customer_addresses` CRUD
- Order creation using `orders`, `order_items`, `services`, `service_prices`
- Automatic `order_qr_codes` creation
- QR retrieval and operational `qr_scan_logs`
- Secure pickup/delivery `order_otps` with scrypt hashing and attempt limits
- Database status transitions through `change_order_status`

Important: generated pickup OTP values are returned by the API for development/testing only. Before production, route the plaintext OTP exclusively through an approved SMS/notification provider and remove it from API responses.
