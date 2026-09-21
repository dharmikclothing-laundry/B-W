-- ============================================================================
-- BRIGHT & WHITE MASTER SCHEMA v1.0
-- Final Consolidated Production SQL for Supabase / PostgreSQL
-- Canonical baseline generated from reconstructed migrations 001-012.
-- Version: 1.0.0
-- IMPORTANT: Execute against a NEW Supabase project/database.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================================
-- 2. ENUMS
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE public.user_role_code AS ENUM ('admin','manager','facility_employee','driver','customer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.order_status AS ENUM (
    'draft','pending_payment','confirmed',
    'pickup_assigned','pickup_accepted','en_route_pickup','pickup_otp_pending','picked_up',
    'in_transit_to_facility','received_at_facility','verification','processing',
    'quality_check','rework_required','ready_for_delivery',
    'delivery_assigned','delivery_accepted','en_route_delivery','delivery_otp_pending',
    'delivered','claim_period_active','completed',
    'cancelled','pickup_failed','delivery_failed','on_hold'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.assignment_type AS ENUM ('pickup','delivery','facility_return','nearby_pickup');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.assignment_status AS ENUM ('assigned','accepted','rejected','en_route','arrived','completed','cancelled','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_method AS ENUM ('razorpay','cash_on_delivery','package_credit','loyalty_points');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM ('pending','authorized','paid','failed','cancelled','refunded','partially_refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.refund_status AS ENUM ('requested','under_review','approved','rejected','processing','completed','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.facility_operation_status AS ENUM (
    'received','verification','washing','drying','ironing','folding','packaging',
    'quality_check','rework_required','ready_for_delivery'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.machine_status AS ENUM ('active','idle','running','maintenance','out_of_service');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.notification_channel AS ENUM ('push','sms','whatsapp','email','in_app');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.notification_status AS ENUM ('queued','processing','sent','delivered','read','failed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.notification_priority AS ENUM ('low','normal','high','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 3. COMMON FUNCTIONS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profile_roles pr
    JOIN public.roles r ON r.id = pr.role_id
    WHERE pr.profile_id = p_user_id AND r.code = 'admin'
  );
$$;

-- ============================================================================
-- 4. IDENTITY, ROLES AND PERMISSIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  phone text UNIQUE,
  avatar_path text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text
);

CREATE TABLE IF NOT EXISTS public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY(role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS public.profile_roles (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  PRIMARY KEY(profile_id, role_id)
);

-- ============================================================================
-- 5. CUSTOMERS AND ADDRESSES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  referral_code text NOT NULL UNIQUE,
  loyalty_balance integer NOT NULL DEFAULT 0 CHECK (loyalty_balance >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  label text,
  address_line1 text NOT NULL,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  location geography(Point,4326),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 6. FACILITIES AND EMPLOYEES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.facilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  location geography(Point,4326),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.facility_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  employee_role text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(facility_id, profile_id)
);

-- ============================================================================
-- 7. DRIVERS, VEHICLES AND GPS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_available boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  max_concurrent_jobs integer NOT NULL DEFAULT 5 CHECK(max_concurrent_jobs > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  registration_number text NOT NULL UNIQUE,
  vehicle_type text,
  capacity_kg numeric(10,2),
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.driver_live_locations (
  driver_id uuid PRIMARY KEY REFERENCES public.drivers(id) ON DELETE CASCADE,
  latitude numeric(10,7) NOT NULL,
  longitude numeric(10,7) NOT NULL,
  location geography(Point,4326),
  accuracy_m numeric(10,2),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.driver_location_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  latitude numeric(10,7) NOT NULL,
  longitude numeric(10,7) NOT NULL,
  location geography(Point,4326),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 8. SERVICES AND PRICING
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.service_categories(id),
  name text NOT NULL,
  description text,
  pricing_unit text NOT NULL DEFAULT 'item',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.service_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  facility_id uuid REFERENCES public.facilities(id) ON DELETE CASCADE,
  price numeric(12,2) NOT NULL CHECK(price >= 0),
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  UNIQUE(service_id, facility_id, effective_from)
);

-- ============================================================================
-- 9. ORDER ENGINE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  facility_id uuid REFERENCES public.facilities(id),
  current_status public.order_status NOT NULL DEFAULT 'draft',
  pickup_address_id uuid REFERENCES public.customer_addresses(id),
  delivery_address_id uuid REFERENCES public.customer_addresses(id),
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  payment_method public.payment_method,
  claim_deadline_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.services(id),
  item_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK(quantity > 0),
  weight_kg numeric(10,2),
  unit_price numeric(12,2) NOT NULL DEFAULT 0 CHECK(unit_price >= 0),
  line_total numeric(12,2) NOT NULL DEFAULT 0 CHECK(line_total >= 0),
  customer_notes text
);

CREATE TABLE IF NOT EXISTS public.order_item_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_qr_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  secure_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.qr_scan_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_code_id uuid NOT NULL REFERENCES public.order_qr_codes(id) ON DELETE CASCADE,
  scanner_profile_id uuid REFERENCES public.profiles(id),
  scan_action text NOT NULL,
  latitude numeric(10,7),
  longitude numeric(10,7),
  scanned_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  otp_type text NOT NULL CHECK(otp_type IN ('pickup','delivery')),
  otp_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  verified_by uuid REFERENCES public.profiles(id),
  attempt_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.delivery_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.drivers(id),
  photo_path text NOT NULL,
  latitude numeric(10,7),
  longitude numeric(10,7),
  delivered_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  from_status public.order_status,
  to_status public.order_status NOT NULL,
  changed_by uuid REFERENCES public.profiles(id),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 10. DRIVER ASSIGNMENTS AND LOGISTICS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.driver_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.drivers(id),
  assignment_type public.assignment_type NOT NULL,
  status public.assignment_status NOT NULL DEFAULT 'assigned',
  assignment_score numeric(12,4),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  completed_at timestamptz,
  rejection_reason text
);

CREATE TABLE IF NOT EXISTS public.route_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id),
  batch_type public.assignment_type NOT NULL,
  status text NOT NULL DEFAULT 'planned',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.route_batch_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_batch_id uuid NOT NULL REFERENCES public.route_batches(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES public.driver_assignments(id) ON DELETE CASCADE,
  stop_sequence integer NOT NULL CHECK(stop_sequence > 0),
  UNIQUE(route_batch_id, stop_sequence)
);

CREATE TABLE IF NOT EXISTS public.driver_navigation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id),
  order_id uuid REFERENCES public.orders(id),
  event_type text NOT NULL,
  destination_latitude numeric(10,7),
  destination_longitude numeric(10,7),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 11. PAYMENTS, RAZORPAY AND REFUNDS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  provider text NOT NULL,
  provider_order_id text,
  provider_payment_id text,
  amount numeric(12,2) NOT NULL CHECK(amount >= 0),
  currency text NOT NULL DEFAULT 'INR',
  status public.payment_status NOT NULL DEFAULT 'pending',
  provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  external_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz,
  processing_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.refund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_transaction_id uuid REFERENCES public.payment_transactions(id),
  requested_by uuid REFERENCES public.profiles(id),
  amount numeric(12,2) NOT NULL CHECK(amount > 0),
  reason text,
  status public.refund_status NOT NULL DEFAULT 'requested',
  approved_by uuid REFERENCES public.profiles(id),
  approved_at timestamptz,
  provider_refund_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 12. PACKAGES, OFFERS, REFERRALS AND LOYALTY
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  monthly_price numeric(12,2) NOT NULL CHECK(monthly_price >= 0),
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.package_service_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id),
  usage_limit integer NOT NULL CHECK(usage_limit >= 0),
  UNIQUE(package_id, service_id)
);

CREATE TABLE IF NOT EXISTS public.package_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  package_id uuid NOT NULL REFERENCES public.packages(id),
  status text NOT NULL DEFAULT 'active',
  auto_renew boolean NOT NULL DEFAULT false,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS public.package_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.package_subscriptions(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id),
  order_id uuid REFERENCES public.orders(id),
  usage_quantity integer NOT NULL DEFAULT 1 CHECK(usage_quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE,
  name text NOT NULL,
  discount_type text NOT NULL CHECK(discount_type IN ('percentage','fixed')),
  discount_value numeric(12,2) NOT NULL CHECK(discount_value >= 0),
  minimum_order_amount numeric(12,2) NOT NULL DEFAULT 0,
  starts_at timestamptz,
  expires_at timestamptz,
  usage_limit integer,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_customer_id uuid NOT NULL REFERENCES public.customers(id),
  referred_customer_id uuid NOT NULL REFERENCES public.customers(id),
  referral_code text NOT NULL,
  reward_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(referred_customer_id)
);

CREATE TABLE IF NOT EXISTS public.loyalty_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  points integer NOT NULL,
  transaction_type text NOT NULL CHECK(transaction_type IN ('earned','redeemed','expired','adjustment')),
  reference_type text,
  reference_id uuid,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 13. FACILITY OPERATIONS AND LAUNDRY PROCESSING
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.facility_order_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  facility_id uuid NOT NULL REFERENCES public.facilities(id),
  current_status public.facility_operation_status NOT NULL DEFAULT 'received',
  received_at timestamptz,
  ready_for_delivery_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.garment_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES public.facility_order_operations(id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES public.order_items(id),
  counted_quantity integer NOT NULL DEFAULT 0,
  weight_kg numeric(10,2),
  condition_notes text,
  verified_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.damage_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES public.facility_order_operations(id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES public.order_items(id),
  description text NOT NULL,
  detected_by uuid REFERENCES public.profiles(id),
  photo_path text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.missing_item_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES public.facility_order_operations(id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES public.order_items(id),
  quantity integer NOT NULL DEFAULT 1 CHECK(quantity > 0),
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.facility_machines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.facilities(id),
  machine_name text NOT NULL,
  machine_type text NOT NULL,
  capacity_kg numeric(10,2),
  status public.machine_status NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS public.facility_processing_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id uuid REFERENCES public.facility_machines(id),
  facility_id uuid NOT NULL REFERENCES public.facilities(id),
  batch_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  started_at timestamptz,
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.processing_batch_orders (
  batch_id uuid NOT NULL REFERENCES public.facility_processing_batches(id) ON DELETE CASCADE,
  operation_id uuid NOT NULL REFERENCES public.facility_order_operations(id) ON DELETE CASCADE,
  PRIMARY KEY(batch_id, operation_id)
);

-- ============================================================================
-- 14. NOTIFICATIONS AND SYSTEM ADMINISTRATION
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  push_enabled boolean NOT NULL DEFAULT true,
  sms_enabled boolean NOT NULL DEFAULT true,
  whatsapp_enabled boolean NOT NULL DEFAULT true,
  promotional_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.push_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK(platform IN ('ios','android','web')),
  provider text NOT NULL CHECK(provider IN ('fcm','apns','expo')),
  device_token text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  channel public.notification_channel NOT NULL DEFAULT 'in_app',
  priority public.notification_priority NOT NULL DEFAULT 'normal',
  event_type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.notification_status NOT NULL DEFAULT 'queued',
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notification_delivery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL DEFAULT 1,
  provider_response jsonb,
  status public.notification_status NOT NULL DEFAULT 'queued',
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.system_configurations (
  config_key text PRIMARY KEY,
  config_value jsonb NOT NULL,
  is_secret boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key text NOT NULL UNIQUE,
  flag_name text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  rollout_percentage numeric(5,2) NOT NULL DEFAULT 100 CHECK(rollout_percentage BETWEEN 0 AND 100),
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES public.profiles(id),
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id),
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'warning' CHECK(severity IN ('info','warning','high','critical')),
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.api_rate_limit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  identifier text NOT NULL,
  endpoint text,
  request_count integer NOT NULL DEFAULT 1,
  window_expires_at timestamptz NOT NULL,
  UNIQUE(scope, identifier, endpoint)
);

CREATE TABLE IF NOT EXISTS public.backup_execution_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_type text NOT NULL,
  status text NOT NULL,
  backup_location text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- ============================================================================
-- 15. ORDER STATUS ENGINE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.order_status_transitions (
  from_status public.order_status,
  to_status public.order_status NOT NULL,
  PRIMARY KEY(from_status, to_status)
);

INSERT INTO public.order_status_transitions(from_status,to_status) VALUES
('draft','pending_payment'),('draft','confirmed'),
('pending_payment','confirmed'),('pending_payment','cancelled'),
('confirmed','pickup_assigned'),('confirmed','cancelled'),
('pickup_assigned','pickup_accepted'),('pickup_assigned','cancelled'),
('pickup_accepted','en_route_pickup'),('en_route_pickup','pickup_otp_pending'),
('pickup_otp_pending','picked_up'),('picked_up','in_transit_to_facility'),
('in_transit_to_facility','received_at_facility'),('received_at_facility','verification'),
('verification','processing'),('processing','quality_check'),('processing','rework_required'),
('rework_required','processing'),('quality_check','ready_for_delivery'),
('ready_for_delivery','delivery_assigned'),('delivery_assigned','delivery_accepted'),
('delivery_accepted','en_route_delivery'),('en_route_delivery','delivery_otp_pending'),
('delivery_otp_pending','delivered'),('delivered','claim_period_active'),
('claim_period_active','completed')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.change_order_status(
  p_order_id uuid, p_new_status public.order_status, p_reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_old public.order_status;
BEGIN
  SELECT current_status INTO v_old FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.order_status_transitions
    WHERE from_status=v_old AND to_status=p_new_status
  ) THEN
    RAISE EXCEPTION 'Invalid order status transition: % -> %', v_old, p_new_status;
  END IF;
  UPDATE public.orders SET current_status=p_new_status, updated_at=now(),
    delivered_at=CASE WHEN p_new_status='delivered' THEN now() ELSE delivered_at END,
    claim_deadline_at=CASE WHEN p_new_status='delivered' THEN now()+interval '7 days' ELSE claim_deadline_at END
  WHERE id=p_order_id;
  INSERT INTO public.order_status_history(order_id,from_status,to_status,changed_by,reason)
  VALUES(p_order_id,v_old,p_new_status,auth.uid(),p_reason);
END $$;

-- ============================================================================
-- 16. AUTOMATION FUNCTIONS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_default_notification_preferences()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.notification_preferences(profile_id)
  VALUES(NEW.id) ON CONFLICT(profile_id) DO NOTHING;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.apply_loyalty_transaction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.customers
  SET loyalty_balance = GREATEST(0, loyalty_balance + NEW.points),
      updated_at=now()
  WHERE id=NEW.customer_id;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_refund_admin_approval()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('approved','processing','completed') AND NEW.approved_by IS NULL THEN
    RAISE EXCEPTION 'Refund approval requires an admin profile';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number='' THEN
    NEW.order_number := 'BW-' || to_char(now(),'YYYYMMDD') || '-' ||
                        upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  END IF;
  RETURN NEW;
END $$;

-- ============================================================================
-- 17. TRIGGERS
-- ============================================================================
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_facilities_updated BEFORE UPDATE ON public.facilities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_drivers_updated BEFORE UPDATE ON public.drivers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_profile_notification_preferences AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.create_default_notification_preferences();
CREATE TRIGGER trg_order_number BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.generate_order_number();
CREATE TRIGGER trg_loyalty_balance AFTER INSERT ON public.loyalty_transactions FOR EACH ROW EXECUTE FUNCTION public.apply_loyalty_transaction();
CREATE TRIGGER trg_refund_admin BEFORE INSERT OR UPDATE ON public.refund_requests FOR EACH ROW EXECUTE FUNCTION public.enforce_refund_admin_approval();

-- ============================================================================
-- 18. INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer ON public.customer_addresses(customer_id);
CREATE INDEX IF NOT EXISTS idx_driver_live_locations_geo ON public.driver_live_locations USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON public.orders(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(current_status);
CREATE INDEX IF NOT EXISTS idx_orders_facility ON public.orders(facility_id, current_status);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_driver_assignments_driver ON public.driver_assignments(driver_id, status);
CREATE INDEX IF NOT EXISTS idx_driver_assignments_order ON public.driver_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_order ON public.payment_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_notifications_profile ON public.notifications(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_open ON public.security_events(created_at DESC) WHERE resolved=false;

-- ============================================================================
-- 19. RLS
-- ============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_self_read ON public.profiles FOR SELECT USING(id=auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE USING(id=auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY customers_self_read ON public.customers FOR SELECT USING(profile_id=auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY addresses_customer_access ON public.customer_addresses FOR ALL USING(
  EXISTS(SELECT 1 FROM public.customers c WHERE c.id=customer_id AND c.profile_id=auth.uid())
  OR public.is_admin(auth.uid())
);

CREATE POLICY orders_customer_read ON public.orders FOR SELECT USING(
  EXISTS(SELECT 1 FROM public.customers c WHERE c.id=customer_id AND c.profile_id=auth.uid())
  OR public.is_admin(auth.uid())
  OR EXISTS(SELECT 1 FROM public.driver_assignments da JOIN public.drivers d ON d.id=da.driver_id WHERE da.order_id=orders.id AND d.profile_id=auth.uid())
);

CREATE POLICY order_items_order_access ON public.order_items FOR SELECT USING(
  EXISTS(
    SELECT 1 FROM public.orders o JOIN public.customers c ON c.id=o.customer_id
    WHERE o.id=order_items.order_id AND c.profile_id=auth.uid()
  ) OR public.is_admin(auth.uid())
);

CREATE POLICY notifications_owner_read ON public.notifications FOR SELECT USING(profile_id=auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY notifications_owner_update ON public.notifications FOR UPDATE USING(profile_id=auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY devices_owner_manage ON public.push_devices FOR ALL USING(profile_id=auth.uid() OR public.is_admin(auth.uid()))
WITH CHECK(profile_id=auth.uid() OR public.is_admin(auth.uid()));

-- Admin/service-role controlled operational tables remain RLS-disabled in this
-- baseline and should be accessed through the Node.js trusted backend only.

-- ============================================================================
-- 20. SUPABASE STORAGE BUCKETS
-- ============================================================================
INSERT INTO storage.buckets(id,name,public) VALUES
('customer-product-photos','customer-product-photos',false),
('facility-order-images','facility-order-images',false),
('delivery-proofs','delivery-proofs',false),
('damage-reports','damage-reports',false),
('driver-documents','driver-documents',false)
ON CONFLICT(id) DO NOTHING;

-- ============================================================================
-- 21. SEED DATA
-- ============================================================================
INSERT INTO public.roles(code,name,description) VALUES
('admin','Administrator','Full system control'),
('manager','Manager','Operational management'),
('facility_employee','Facility Employee','Facility processing access'),
('driver','Driver','Pickup and delivery access'),
('customer','Customer','Customer application access')
ON CONFLICT(code) DO NOTHING;

INSERT INTO public.permissions(code,name) VALUES
('orders.read','Read orders'),('orders.manage','Manage orders'),
('drivers.manage','Manage drivers'),('facilities.manage','Manage facilities'),
('services.manage','Manage services and pricing'),('refunds.approve','Approve refunds'),
('users.manage','Manage users'),('analytics.read','Read analytics')
ON CONFLICT(code) DO NOTHING;

INSERT INTO public.system_configurations(config_key,config_value) VALUES
('claim_period_days','{"days":7}'::jsonb),
('pickup_otp_required','{"enabled":true}'::jsonb),
('delivery_otp_required','{"enabled":true}'::jsonb),
('delivery_photo_required','{"enabled":true}'::jsonb),
('driver_location_update_seconds','{"seconds":15}'::jsonb)
ON CONFLICT(config_key) DO NOTHING;

COMMIT;
