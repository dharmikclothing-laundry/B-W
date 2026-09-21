


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."assignment_status" AS ENUM (
    'assigned',
    'accepted',
    'rejected',
    'en_route',
    'arrived',
    'completed',
    'cancelled',
    'expired',
    'reassignment_required'
);


ALTER TYPE "public"."assignment_status" OWNER TO "postgres";


CREATE TYPE "public"."assignment_type" AS ENUM (
    'pickup',
    'delivery',
    'facility_return',
    'nearby_pickup'
);


ALTER TYPE "public"."assignment_type" OWNER TO "postgres";


CREATE TYPE "public"."facility_operation_status" AS ENUM (
    'received',
    'verification',
    'washing',
    'drying',
    'ironing',
    'folding',
    'packaging',
    'quality_check',
    'rework_required',
    'ready_for_delivery'
);


ALTER TYPE "public"."facility_operation_status" OWNER TO "postgres";


CREATE TYPE "public"."machine_status" AS ENUM (
    'active',
    'idle',
    'running',
    'maintenance',
    'out_of_service'
);


ALTER TYPE "public"."machine_status" OWNER TO "postgres";


CREATE TYPE "public"."notification_channel" AS ENUM (
    'push',
    'sms',
    'whatsapp',
    'email',
    'in_app'
);


ALTER TYPE "public"."notification_channel" OWNER TO "postgres";


CREATE TYPE "public"."notification_priority" AS ENUM (
    'low',
    'normal',
    'high',
    'critical'
);


ALTER TYPE "public"."notification_priority" OWNER TO "postgres";


CREATE TYPE "public"."notification_status" AS ENUM (
    'queued',
    'processing',
    'sent',
    'delivered',
    'read',
    'failed',
    'cancelled'
);


ALTER TYPE "public"."notification_status" OWNER TO "postgres";


CREATE TYPE "public"."order_status" AS ENUM (
    'draft',
    'pending_payment',
    'confirmed',
    'pickup_assigned',
    'pickup_accepted',
    'en_route_pickup',
    'pickup_otp_pending',
    'picked_up',
    'in_transit_to_facility',
    'received_at_facility',
    'verification',
    'processing',
    'quality_check',
    'rework_required',
    'ready_for_delivery',
    'delivery_assigned',
    'delivery_accepted',
    'en_route_delivery',
    'delivery_otp_pending',
    'delivered',
    'claim_period_active',
    'completed',
    'cancelled',
    'pickup_failed',
    'delivery_failed',
    'on_hold'
);


ALTER TYPE "public"."order_status" OWNER TO "postgres";


CREATE TYPE "public"."payment_method" AS ENUM (
    'razorpay',
    'cash_on_delivery',
    'package_credit',
    'loyalty_points'
);


ALTER TYPE "public"."payment_method" OWNER TO "postgres";


CREATE TYPE "public"."payment_status" AS ENUM (
    'pending',
    'authorized',
    'paid',
    'failed',
    'cancelled',
    'refunded',
    'partially_refunded'
);


ALTER TYPE "public"."payment_status" OWNER TO "postgres";


CREATE TYPE "public"."refund_status" AS ENUM (
    'requested',
    'under_review',
    'approved',
    'rejected',
    'processing',
    'completed',
    'failed'
);


ALTER TYPE "public"."refund_status" OWNER TO "postgres";


CREATE TYPE "public"."user_role_code" AS ENUM (
    'admin',
    'manager',
    'facility_employee',
    'driver',
    'customer'
);


ALTER TYPE "public"."user_role_code" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_loyalty_transaction"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE public.customers
  SET loyalty_balance = GREATEST(0, loyalty_balance + NEW.points),
      updated_at=now()
  WHERE id=NEW.customer_id;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."apply_loyalty_transaction"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."change_order_status"("p_order_id" "uuid", "p_new_status" "public"."order_status", "p_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_old public.order_status;
BEGIN
  SELECT current_status INTO v_old FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_old IS DISTINCT FROM p_new_status AND NOT EXISTS (
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


ALTER FUNCTION "public"."change_order_status"("p_order_id" "uuid", "p_new_status" "public"."order_status", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_default_notification_preferences"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.notification_preferences(profile_id)
  VALUES(NEW.id) ON CONFLICT(profile_id) DO NOTHING;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."create_default_notification_preferences"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_refund_admin_approval"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.status IN ('approved','processing','completed') AND NEW.approved_by IS NULL THEN
    RAISE EXCEPTION 'Refund approval requires an admin profile';
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."enforce_refund_admin_approval"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_driver_assignment_candidates"("p_order_id" "uuid", "p_assignment_type" "public"."assignment_type", "p_limit" integer DEFAULT 12) RETURNS TABLE("driver_id" "uuid", "driver_latitude" numeric, "driver_longitude" numeric, "target_latitude" numeric, "target_longitude" numeric, "active_workload" bigint, "route_compatibility" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH target AS (
    SELECT CASE WHEN p_assignment_type='pickup' THEN ca_pick.location ELSE ca_drop.location END AS location
    FROM public.orders o
    JOIN public.customer_addresses ca_pick ON ca_pick.id=o.pickup_address_id
    JOIN public.customer_addresses ca_drop ON ca_drop.id=o.delivery_address_id
    WHERE o.id=p_order_id
  ), workloads AS (
    SELECT driver_id,count(*)::bigint active_workload FROM public.driver_assignments
    WHERE status::text IN ('assigned','accepted','en_route') GROUP BY driver_id
  )
  SELECT d.id, dll.latitude, dll.longitude,
    ST_Y(t.location::geometry)::numeric, ST_X(t.location::geometry)::numeric,
    COALESCE(w.active_workload,0),0::numeric
  FROM public.drivers d JOIN public.driver_live_locations dll ON dll.driver_id=d.id
  CROSS JOIN target t LEFT JOIN workloads w ON w.driver_id=d.id
  WHERE d.is_available=true AND dll.location IS NOT NULL AND t.location IS NOT NULL
  ORDER BY dll.location <-> t.location LIMIT GREATEST(1,LEAST(p_limit,50));
$$;


ALTER FUNCTION "public"."find_driver_assignment_candidates"("p_order_id" "uuid", "p_assignment_type" "public"."assignment_type", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_nearby_driver_jobs"("p_driver_id" "uuid", "p_radius_meters" numeric DEFAULT 3000) RETURNS TABLE("order_id" "uuid", "assignment_id" "uuid", "assignment_type" "public"."assignment_type", "distance_meters" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT da.order_id,da.id,da.assignment_type,ST_Distance(dll.location,ca.location)::numeric
  FROM public.driver_live_locations dll JOIN public.driver_assignments da ON da.driver_id=p_driver_id
  JOIN public.orders o ON o.id=da.order_id
  JOIN public.customer_addresses ca ON ca.id=CASE WHEN da.assignment_type='pickup' THEN o.pickup_address_id ELSE o.delivery_address_id END
  WHERE dll.driver_id=p_driver_id AND da.status::text IN ('assigned','accepted','en_route')
    AND dll.location IS NOT NULL AND ca.location IS NOT NULL
    AND ST_DWithin(dll.location,ca.location,p_radius_meters)
  ORDER BY ST_Distance(dll.location,ca.location);
$$;


ALTER FUNCTION "public"."find_nearby_driver_jobs"("p_driver_id" "uuid", "p_radius_meters" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_order_number"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number='' THEN
    NEW.order_number := 'BW-' || to_char(now(),'YYYYMMDD') || '-' ||
                        upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."generate_order_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_customer_loyalty_balance"("p_customer_id" "uuid") RETURNS numeric
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(SUM(points),0) FROM public.loyalty_point_transactions WHERE customer_id=p_customer_id;
$$;


ALTER FUNCTION "public"."get_customer_loyalty_balance"("p_customer_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profile_roles pr
    INNER JOIN public.roles r
      ON r.id = pr.role_id
    WHERE pr.profile_id = p_user_id
      AND r.code = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_admin"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_driver_live_location"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude),4326)::geography;
  ELSIF NEW.location IS NOT NULL THEN
    NEW.latitude := ST_Y(NEW.location::geometry);
    NEW.longitude := ST_X(NEW.location::geometry);
  END IF;
  NEW.updated_at := COALESCE(NEW.updated_at, now());
  NEW.recorded_at := COALESCE(NEW.recorded_at, now());
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."sync_driver_live_location"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_driver_live_location"("p_driver_id" "uuid", "p_latitude" numeric, "p_longitude" numeric, "p_accuracy_m" numeric DEFAULT NULL::numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.driver_live_locations(
    driver_id, latitude, longitude, location, accuracy_m, recorded_at, updated_at
  ) VALUES (
    p_driver_id, p_latitude, p_longitude,
    ST_SetSRID(ST_MakePoint(p_longitude,p_latitude),4326)::geography,
    p_accuracy_m, now(), now()
  )
  ON CONFLICT (driver_id) DO UPDATE SET
    latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude,
    location=EXCLUDED.location, accuracy_m=EXCLUDED.accuracy_m,
    recorded_at=now(), updated_at=now();
END $$;


ALTER FUNCTION "public"."upsert_driver_live_location"("p_driver_id" "uuid", "p_latitude" numeric, "p_longitude" numeric, "p_accuracy_m" numeric) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."admin_activity_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_id" "uuid",
    "action" "text" NOT NULL,
    "entity_type" "text",
    "entity_id" "uuid",
    "before_data" "jsonb",
    "after_data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actor_profile_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."admin_activity_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."api_rate_limit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "scope" "text" NOT NULL,
    "identifier" "text" NOT NULL,
    "endpoint" "text",
    "request_count" integer DEFAULT 1 NOT NULL,
    "window_expires_at" timestamp with time zone NOT NULL
);


ALTER TABLE "public"."api_rate_limit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."backup_execution_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "backup_type" "text" NOT NULL,
    "status" "text" NOT NULL,
    "backup_location" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."backup_execution_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_addresses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "label" "text",
    "address_line1" "text" NOT NULL,
    "address_line2" "text",
    "city" "text",
    "state" "text",
    "postal_code" "text",
    "latitude" numeric(10,7),
    "longitude" numeric(10,7),
    "location" "public"."geography"(Point,4326),
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."customer_addresses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "referral_code" "text" NOT NULL,
    "loyalty_balance" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "customers_loyalty_balance_check" CHECK (("loyalty_balance" >= 0))
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."damage_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "operation_id" "uuid" NOT NULL,
    "order_item_id" "uuid",
    "description" "text" NOT NULL,
    "detected_by" "uuid",
    "photo_path" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."damage_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_proofs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "driver_id" "uuid" NOT NULL,
    "photo_path" "text" NOT NULL,
    "latitude" numeric(10,7),
    "longitude" numeric(10,7),
    "delivered_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."delivery_proofs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."device_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "push_token" "text" NOT NULL,
    "platform" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "device_tokens_platform_check" CHECK (("platform" = ANY (ARRAY['ios'::"text", 'android'::"text"])))
);


ALTER TABLE "public"."device_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."driver_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "driver_id" "uuid" NOT NULL,
    "assignment_type" "public"."assignment_type" NOT NULL,
    "status" "public"."assignment_status" DEFAULT 'assigned'::"public"."assignment_status" NOT NULL,
    "assignment_score" numeric(12,4),
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "accepted_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "rejection_reason" "text"
);


ALTER TABLE "public"."driver_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."driver_live_locations" (
    "driver_id" "uuid" NOT NULL,
    "latitude" numeric(10,7) NOT NULL,
    "longitude" numeric(10,7) NOT NULL,
    "location" "public"."geography"(Point,4326),
    "accuracy_m" numeric(10,2),
    "recorded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."driver_live_locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."driver_location_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "driver_id" "uuid" NOT NULL,
    "latitude" numeric(10,7) NOT NULL,
    "longitude" numeric(10,7) NOT NULL,
    "location" "public"."geography"(Point,4326),
    "recorded_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."driver_location_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."driver_navigation_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "driver_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "event_type" "text" NOT NULL,
    "destination_latitude" numeric(10,7),
    "destination_longitude" numeric(10,7),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."driver_navigation_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drivers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "is_available" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "max_concurrent_jobs" integer DEFAULT 5 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "drivers_max_concurrent_jobs_check" CHECK (("max_concurrent_jobs" > 0))
);


ALTER TABLE "public"."drivers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."facilities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "address" "text",
    "latitude" numeric(10,7),
    "longitude" numeric(10,7),
    "location" "public"."geography"(Point,4326),
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."facilities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."facility_employees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "facility_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "employee_role" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."facility_employees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."facility_machines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "facility_id" "uuid" NOT NULL,
    "machine_name" "text" NOT NULL,
    "machine_type" "text" NOT NULL,
    "capacity_kg" numeric(10,2),
    "status" "public"."machine_status" DEFAULT 'active'::"public"."machine_status" NOT NULL
);


ALTER TABLE "public"."facility_machines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."facility_order_operations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "facility_id" "uuid",
    "current_status" "public"."facility_operation_status" DEFAULT 'received'::"public"."facility_operation_status" NOT NULL,
    "received_at" timestamp with time zone,
    "ready_for_delivery_at" timestamp with time zone,
    "operation_type" "text",
    "performed_by" "uuid",
    "machine_id" "uuid",
    "status" "text",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "notes" "text"
);


ALTER TABLE "public"."facility_order_operations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."facility_processing_batches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "machine_id" "uuid",
    "facility_id" "uuid" NOT NULL,
    "batch_type" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone
);


ALTER TABLE "public"."facility_processing_batches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feature_flags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "flag_key" "text" NOT NULL,
    "flag_name" "text" NOT NULL,
    "is_enabled" boolean DEFAULT false NOT NULL,
    "rollout_percentage" numeric(5,2) DEFAULT 100 NOT NULL,
    "configuration" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "feature_flags_rollout_percentage_check" CHECK ((("rollout_percentage" >= (0)::numeric) AND ("rollout_percentage" <= (100)::numeric)))
);


ALTER TABLE "public"."feature_flags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."financial_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_profile_id" "uuid",
    "action" "text" NOT NULL,
    "entity_type" "text",
    "entity_id" "uuid",
    "amount" numeric(12,2),
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."financial_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."garment_inspections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "operation_id" "uuid",
    "order_item_id" "uuid",
    "counted_quantity" integer DEFAULT 0 NOT NULL,
    "weight_kg" numeric(10,2),
    "condition_notes" "text",
    "verified_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "order_id" "uuid",
    "inspected_by" "uuid",
    "item_count" integer,
    "inspection_status" "text"
);


ALTER TABLE "public"."garment_inspections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_point_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "points" integer NOT NULL,
    "transaction_type" "text" NOT NULL,
    "reason" "text",
    "reference_type" "text",
    "reference_id" "uuid",
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."loyalty_point_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "points" integer NOT NULL,
    "transaction_type" "text" NOT NULL,
    "reference_type" "text",
    "reference_id" "uuid",
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "loyalty_transactions_transaction_type_check" CHECK (("transaction_type" = ANY (ARRAY['earned'::"text", 'redeemed'::"text", 'expired'::"text", 'adjustment'::"text"])))
);


ALTER TABLE "public"."loyalty_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."missing_item_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "operation_id" "uuid" NOT NULL,
    "order_item_id" "uuid",
    "quantity" integer DEFAULT 1 NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "missing_item_reports_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."missing_item_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_delivery_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "notification_id" "uuid" NOT NULL,
    "attempt_number" integer DEFAULT 1 NOT NULL,
    "provider_response" "jsonb",
    "status" "public"."notification_status" DEFAULT 'queued'::"public"."notification_status" NOT NULL,
    "attempted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notification_delivery_attempts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_preferences" (
    "profile_id" "uuid" NOT NULL,
    "push_enabled" boolean DEFAULT true NOT NULL,
    "sms_enabled" boolean DEFAULT true NOT NULL,
    "whatsapp_enabled" boolean DEFAULT true NOT NULL,
    "promotional_enabled" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notification_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "channel" "public"."notification_channel" DEFAULT 'in_app'::"public"."notification_channel" NOT NULL,
    "priority" "public"."notification_priority" DEFAULT 'normal'::"public"."notification_priority" NOT NULL,
    "event_type" "text",
    "title" "text" NOT NULL,
    "message" "text",
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "public"."notification_status" DEFAULT 'queued'::"public"."notification_status" NOT NULL,
    "is_read" boolean DEFAULT false NOT NULL,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notification_type" "text",
    "body" "text"
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."offers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text",
    "name" "text" NOT NULL,
    "discount_type" "text" NOT NULL,
    "discount_value" numeric(12,2) NOT NULL,
    "minimum_order_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "starts_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "usage_limit" integer,
    "is_active" boolean DEFAULT true NOT NULL,
    "coupon_code" "text",
    "maximum_discount" numeric(12,2),
    CONSTRAINT "offers_discount_type_check" CHECK (("discount_type" = ANY (ARRAY['percentage'::"text", 'fixed'::"text"]))),
    CONSTRAINT "offers_discount_value_check" CHECK (("discount_value" >= (0)::numeric))
);


ALTER TABLE "public"."offers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_item_photos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_item_id" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "uploaded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."order_item_photos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "service_id" "uuid",
    "item_name" "text" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "weight_kg" numeric(10,2),
    "unit_price" numeric(12,2) DEFAULT 0 NOT NULL,
    "line_total" numeric(12,2) DEFAULT 0 NOT NULL,
    "customer_notes" "text",
    CONSTRAINT "order_items_line_total_check" CHECK (("line_total" >= (0)::numeric)),
    CONSTRAINT "order_items_quantity_check" CHECK (("quantity" > 0)),
    CONSTRAINT "order_items_unit_price_check" CHECK (("unit_price" >= (0)::numeric))
);


ALTER TABLE "public"."order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_otps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "otp_type" "text" NOT NULL,
    "otp_hash" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "verified_at" timestamp with time zone,
    "verified_by" "uuid",
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "order_otps_otp_type_check" CHECK (("otp_type" = ANY (ARRAY['pickup'::"text", 'delivery'::"text"])))
);


ALTER TABLE "public"."order_otps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_qr_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "secure_token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."order_qr_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_status_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "from_status" "public"."order_status",
    "to_status" "public"."order_status" NOT NULL,
    "changed_by" "uuid",
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."order_status_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_status_transitions" (
    "from_status" "public"."order_status" NOT NULL,
    "to_status" "public"."order_status" NOT NULL
);


ALTER TABLE "public"."order_status_transitions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_number" "text" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "facility_id" "uuid",
    "current_status" "public"."order_status" DEFAULT 'draft'::"public"."order_status" NOT NULL,
    "pickup_address_id" "uuid",
    "delivery_address_id" "uuid",
    "subtotal" numeric(12,2) DEFAULT 0 NOT NULL,
    "discount_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "total_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "payment_method" "public"."payment_method",
    "claim_deadline_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "currency" "text" DEFAULT 'INR'::"text" NOT NULL
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."package_service_limits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "package_id" "uuid" NOT NULL,
    "service_id" "uuid" NOT NULL,
    "usage_limit" integer NOT NULL,
    CONSTRAINT "package_service_limits_usage_limit_check" CHECK (("usage_limit" >= 0))
);


ALTER TABLE "public"."package_service_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."package_services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "package_id" "uuid" NOT NULL,
    "service_id" "uuid" NOT NULL,
    "usage_limit" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."package_services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."package_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "package_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "auto_renew" boolean DEFAULT false NOT NULL,
    "starts_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"(),
    "amount" numeric(12,2)
);


ALTER TABLE "public"."package_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."package_usage" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "subscription_id" "uuid" NOT NULL,
    "service_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "usage_quantity" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "customer_id" "uuid",
    "package_service_id" "uuid",
    CONSTRAINT "package_usage_usage_quantity_check" CHECK (("usage_quantity" > 0))
);


ALTER TABLE "public"."package_usage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."packages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "monthly_price" numeric(12,2) NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "price" numeric(12,2) DEFAULT 0,
    CONSTRAINT "packages_monthly_price_check" CHECK (("monthly_price" >= (0)::numeric))
);


ALTER TABLE "public"."packages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "provider_order_id" "text" NOT NULL,
    "provider_payment_id" "text",
    "amount" numeric(12,2) NOT NULL,
    "currency" "text" DEFAULT 'INR'::"text" NOT NULL,
    "status" "text" DEFAULT 'created'::"text" NOT NULL,
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payment_orders_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "payment_orders_status_check" CHECK (("status" = ANY (ARRAY['created'::"text", 'authorized'::"text", 'paid'::"text", 'failed'::"text", 'cancelled'::"text", 'refunded'::"text", 'partially_refunded'::"text"])))
);


ALTER TABLE "public"."payment_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid",
    "provider" "text",
    "provider_order_id" "text",
    "provider_payment_id" "text",
    "amount" numeric(12,2) NOT NULL,
    "currency" "text" DEFAULT 'INR'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"public"."payment_status" NOT NULL,
    "provider_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "verified_at" timestamp with time zone,
    "payment_order_id" "uuid",
    "transaction_type" "text",
    "provider_reference" "text",
    "processed_at" timestamp with time zone,
    CONSTRAINT "payment_transactions_amount_check" CHECK (("amount" >= (0)::numeric))
);


ALTER TABLE "public"."payment_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_webhook_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" NOT NULL,
    "external_event_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "processed_at" timestamp with time zone,
    "processing_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "provider_event_id" "text"
);


ALTER TABLE "public"."payment_webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text"
);


ALTER TABLE "public"."permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."processing_batch_orders" (
    "batch_id" "uuid" NOT NULL,
    "operation_id" "uuid" NOT NULL
);


ALTER TABLE "public"."processing_batch_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profile_roles" (
    "profile_id" "uuid" NOT NULL,
    "role_id" "uuid" NOT NULL
);


ALTER TABLE "public"."profile_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "phone" "text",
    "avatar_path" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_devices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "platform" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "device_token" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "push_devices_platform_check" CHECK (("platform" = ANY (ARRAY['ios'::"text", 'android'::"text", 'web'::"text"]))),
    CONSTRAINT "push_devices_provider_check" CHECK (("provider" = ANY (ARRAY['fcm'::"text", 'apns'::"text", 'expo'::"text"])))
);


ALTER TABLE "public"."push_devices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."qr_scan_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "qr_code_id" "uuid" NOT NULL,
    "scanner_profile_id" "uuid",
    "scan_action" "text" NOT NULL,
    "latitude" numeric(10,7),
    "longitude" numeric(10,7),
    "scanned_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."qr_scan_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."referral_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."referral_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."referrals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "referrer_customer_id" "uuid" NOT NULL,
    "referred_customer_id" "uuid" NOT NULL,
    "referral_code" "text",
    "reward_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text"
);


ALTER TABLE "public"."referrals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."refund_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payment_transaction_id" "uuid",
    "requested_by" "uuid",
    "amount" numeric(12,2) NOT NULL,
    "reason" "text",
    "status" "public"."refund_status" DEFAULT 'requested'::"public"."refund_status" NOT NULL,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "provider_refund_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payment_order_id" "uuid",
    "processed_at" timestamp with time zone,
    CONSTRAINT "refund_requests_amount_check" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "public"."refund_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."role_permissions" (
    "role_id" "uuid" NOT NULL,
    "permission_id" "uuid" NOT NULL
);


ALTER TABLE "public"."role_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text"
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."route_batch_stops" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "route_batch_id" "uuid" NOT NULL,
    "assignment_id" "uuid" NOT NULL,
    "stop_sequence" integer NOT NULL,
    CONSTRAINT "route_batch_stops_stop_sequence_check" CHECK (("stop_sequence" > 0))
);


ALTER TABLE "public"."route_batch_stops" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."route_batches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "driver_id" "uuid" NOT NULL,
    "batch_type" "public"."assignment_type" NOT NULL,
    "status" "text" DEFAULT 'planned'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."route_batches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."security_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid",
    "event_type" "text" NOT NULL,
    "severity" "text" DEFAULT 'warning'::"text" NOT NULL,
    "description" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "resolved" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "security_events_severity_check" CHECK (("severity" = ANY (ARRAY['info'::"text", 'warning'::"text", 'high'::"text", 'critical'::"text"])))
);


ALTER TABLE "public"."security_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."service_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_prices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "service_id" "uuid" NOT NULL,
    "facility_id" "uuid",
    "price" numeric(12,2) NOT NULL,
    "effective_from" timestamp with time zone DEFAULT "now"() NOT NULL,
    "effective_to" timestamp with time zone,
    CONSTRAINT "service_prices_price_check" CHECK (("price" >= (0)::numeric))
);


ALTER TABLE "public"."service_prices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "pricing_unit" "text" DEFAULT 'item'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_configurations" (
    "config_key" "text" NOT NULL,
    "config_value" "jsonb" NOT NULL,
    "is_secret" boolean DEFAULT false NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."system_configurations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "driver_id" "uuid",
    "registration_number" "text" NOT NULL,
    "vehicle_type" "text",
    "capacity_kg" numeric(10,2),
    "is_active" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."vehicles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."admin_activity_logs"
    ADD CONSTRAINT "admin_activity_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."api_rate_limit_logs"
    ADD CONSTRAINT "api_rate_limit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."api_rate_limit_logs"
    ADD CONSTRAINT "api_rate_limit_logs_scope_identifier_endpoint_key" UNIQUE ("scope", "identifier", "endpoint");



ALTER TABLE ONLY "public"."backup_execution_logs"
    ADD CONSTRAINT "backup_execution_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_addresses"
    ADD CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_profile_id_key" UNIQUE ("profile_id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_referral_code_key" UNIQUE ("referral_code");



ALTER TABLE ONLY "public"."damage_reports"
    ADD CONSTRAINT "damage_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_proofs"
    ADD CONSTRAINT "delivery_proofs_order_id_key" UNIQUE ("order_id");



ALTER TABLE ONLY "public"."delivery_proofs"
    ADD CONSTRAINT "delivery_proofs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."device_tokens"
    ADD CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."device_tokens"
    ADD CONSTRAINT "device_tokens_push_token_key" UNIQUE ("push_token");



ALTER TABLE ONLY "public"."driver_assignments"
    ADD CONSTRAINT "driver_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."driver_live_locations"
    ADD CONSTRAINT "driver_live_locations_pkey" PRIMARY KEY ("driver_id");



ALTER TABLE ONLY "public"."driver_location_history"
    ADD CONSTRAINT "driver_location_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."driver_navigation_events"
    ADD CONSTRAINT "driver_navigation_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drivers"
    ADD CONSTRAINT "drivers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drivers"
    ADD CONSTRAINT "drivers_profile_id_key" UNIQUE ("profile_id");



ALTER TABLE ONLY "public"."facilities"
    ADD CONSTRAINT "facilities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."facility_employees"
    ADD CONSTRAINT "facility_employees_facility_id_profile_id_key" UNIQUE ("facility_id", "profile_id");



ALTER TABLE ONLY "public"."facility_employees"
    ADD CONSTRAINT "facility_employees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."facility_machines"
    ADD CONSTRAINT "facility_machines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."facility_order_operations"
    ADD CONSTRAINT "facility_order_operations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."facility_processing_batches"
    ADD CONSTRAINT "facility_processing_batches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feature_flags"
    ADD CONSTRAINT "feature_flags_flag_key_key" UNIQUE ("flag_key");



ALTER TABLE ONLY "public"."feature_flags"
    ADD CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."financial_audit_logs"
    ADD CONSTRAINT "financial_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."garment_inspections"
    ADD CONSTRAINT "garment_inspections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loyalty_point_transactions"
    ADD CONSTRAINT "loyalty_point_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loyalty_transactions"
    ADD CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."missing_item_reports"
    ADD CONSTRAINT "missing_item_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_delivery_attempts"
    ADD CONSTRAINT "notification_delivery_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("profile_id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."offers"
    ADD CONSTRAINT "offers_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."offers"
    ADD CONSTRAINT "offers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_item_photos"
    ADD CONSTRAINT "order_item_photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_otps"
    ADD CONSTRAINT "order_otps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_qr_codes"
    ADD CONSTRAINT "order_qr_codes_order_id_key" UNIQUE ("order_id");



ALTER TABLE ONLY "public"."order_qr_codes"
    ADD CONSTRAINT "order_qr_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_qr_codes"
    ADD CONSTRAINT "order_qr_codes_secure_token_key" UNIQUE ("secure_token");



ALTER TABLE ONLY "public"."order_status_history"
    ADD CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_status_transitions"
    ADD CONSTRAINT "order_status_transitions_pkey" PRIMARY KEY ("from_status", "to_status");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_order_number_key" UNIQUE ("order_number");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."package_service_limits"
    ADD CONSTRAINT "package_service_limits_package_id_service_id_key" UNIQUE ("package_id", "service_id");



ALTER TABLE ONLY "public"."package_service_limits"
    ADD CONSTRAINT "package_service_limits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."package_services"
    ADD CONSTRAINT "package_services_package_id_service_id_key" UNIQUE ("package_id", "service_id");



ALTER TABLE ONLY "public"."package_services"
    ADD CONSTRAINT "package_services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."package_subscriptions"
    ADD CONSTRAINT "package_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."package_usage"
    ADD CONSTRAINT "package_usage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."packages"
    ADD CONSTRAINT "packages_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."packages"
    ADD CONSTRAINT "packages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_orders"
    ADD CONSTRAINT "payment_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_orders"
    ADD CONSTRAINT "payment_orders_provider_order_id_key" UNIQUE ("provider_order_id");



ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_webhook_events"
    ADD CONSTRAINT "payment_webhook_events_external_event_id_key" UNIQUE ("external_event_id");



ALTER TABLE ONLY "public"."payment_webhook_events"
    ADD CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."processing_batch_orders"
    ADD CONSTRAINT "processing_batch_orders_pkey" PRIMARY KEY ("batch_id", "operation_id");



ALTER TABLE ONLY "public"."profile_roles"
    ADD CONSTRAINT "profile_roles_pkey" PRIMARY KEY ("profile_id", "role_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_phone_key" UNIQUE ("phone");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_devices"
    ADD CONSTRAINT "push_devices_device_token_key" UNIQUE ("device_token");



ALTER TABLE ONLY "public"."push_devices"
    ADD CONSTRAINT "push_devices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."qr_scan_logs"
    ADD CONSTRAINT "qr_scan_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referral_codes"
    ADD CONSTRAINT "referral_codes_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."referral_codes"
    ADD CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_referred_customer_id_key" UNIQUE ("referred_customer_id");



ALTER TABLE ONLY "public"."refund_requests"
    ADD CONSTRAINT "refund_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id", "permission_id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."route_batch_stops"
    ADD CONSTRAINT "route_batch_stops_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."route_batch_stops"
    ADD CONSTRAINT "route_batch_stops_route_batch_id_stop_sequence_key" UNIQUE ("route_batch_id", "stop_sequence");



ALTER TABLE ONLY "public"."route_batches"
    ADD CONSTRAINT "route_batches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."security_events"
    ADD CONSTRAINT "security_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_categories"
    ADD CONSTRAINT "service_categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."service_categories"
    ADD CONSTRAINT "service_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_prices"
    ADD CONSTRAINT "service_prices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_prices"
    ADD CONSTRAINT "service_prices_service_id_facility_id_effective_from_key" UNIQUE ("service_id", "facility_id", "effective_from");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_configurations"
    ADD CONSTRAINT "system_configurations_pkey" PRIMARY KEY ("config_key");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_registration_number_key" UNIQUE ("registration_number");



CREATE INDEX "idx_customer_addresses_customer" ON "public"."customer_addresses" USING "btree" ("customer_id");



CREATE INDEX "idx_driver_assignments_driver" ON "public"."driver_assignments" USING "btree" ("driver_id", "status");



CREATE INDEX "idx_driver_assignments_order" ON "public"."driver_assignments" USING "btree" ("order_id");



CREATE INDEX "idx_driver_live_locations_geo" ON "public"."driver_live_locations" USING "gist" ("location");



CREATE INDEX "idx_facility_operations_order" ON "public"."facility_order_operations" USING "btree" ("order_id");



CREATE INDEX "idx_garment_inspections_order" ON "public"."garment_inspections" USING "btree" ("order_id");



CREATE INDEX "idx_loyalty_points_customer" ON "public"."loyalty_point_transactions" USING "btree" ("customer_id", "created_at" DESC);



CREATE INDEX "idx_notifications_profile" ON "public"."notifications" USING "btree" ("profile_id", "created_at" DESC);



CREATE INDEX "idx_notifications_profile_created" ON "public"."notifications" USING "btree" ("profile_id", "created_at" DESC);



CREATE INDEX "idx_order_items_order" ON "public"."order_items" USING "btree" ("order_id");



CREATE INDEX "idx_orders_customer" ON "public"."orders" USING "btree" ("customer_id", "created_at" DESC);



CREATE INDEX "idx_orders_facility" ON "public"."orders" USING "btree" ("facility_id", "current_status");



CREATE INDEX "idx_orders_status" ON "public"."orders" USING "btree" ("current_status");



CREATE INDEX "idx_package_usage_customer" ON "public"."package_usage" USING "btree" ("customer_id");



CREATE INDEX "idx_payment_orders_order" ON "public"."payment_orders" USING "btree" ("order_id");



CREATE INDEX "idx_payment_transactions_order" ON "public"."payment_transactions" USING "btree" ("order_id");



CREATE INDEX "idx_referral_codes_customer" ON "public"."referral_codes" USING "btree" ("customer_id");



CREATE INDEX "idx_refund_requests_status" ON "public"."refund_requests" USING "btree" ("status");



CREATE INDEX "idx_security_events_open" ON "public"."security_events" USING "btree" ("created_at" DESC) WHERE ("resolved" = false);



CREATE UNIQUE INDEX "uq_offers_coupon_code" ON "public"."offers" USING "btree" ("coupon_code") WHERE ("coupon_code" IS NOT NULL);



CREATE UNIQUE INDEX "uq_payment_webhook_provider_event" ON "public"."payment_webhook_events" USING "btree" ("provider", "provider_event_id") WHERE ("provider_event_id" IS NOT NULL);



CREATE OR REPLACE TRIGGER "trg_customers_updated" BEFORE UPDATE ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_drivers_updated" BEFORE UPDATE ON "public"."drivers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_facilities_updated" BEFORE UPDATE ON "public"."facilities" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_loyalty_balance" AFTER INSERT ON "public"."loyalty_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."apply_loyalty_transaction"();



CREATE OR REPLACE TRIGGER "trg_order_number" BEFORE INSERT ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."generate_order_number"();



CREATE OR REPLACE TRIGGER "trg_orders_updated" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_profile_notification_preferences" AFTER INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."create_default_notification_preferences"();



CREATE OR REPLACE TRIGGER "trg_profiles_updated" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_refund_admin" BEFORE INSERT OR UPDATE ON "public"."refund_requests" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_refund_admin_approval"();



CREATE OR REPLACE TRIGGER "trg_sync_driver_live_location" BEFORE INSERT OR UPDATE ON "public"."driver_live_locations" FOR EACH ROW EXECUTE FUNCTION "public"."sync_driver_live_location"();



ALTER TABLE ONLY "public"."admin_activity_logs"
    ADD CONSTRAINT "admin_activity_logs_actor_profile_id_fkey" FOREIGN KEY ("actor_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."admin_activity_logs"
    ADD CONSTRAINT "admin_activity_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."customer_addresses"
    ADD CONSTRAINT "customer_addresses_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."damage_reports"
    ADD CONSTRAINT "damage_reports_detected_by_fkey" FOREIGN KEY ("detected_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."damage_reports"
    ADD CONSTRAINT "damage_reports_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "public"."facility_order_operations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."damage_reports"
    ADD CONSTRAINT "damage_reports_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id");



ALTER TABLE ONLY "public"."delivery_proofs"
    ADD CONSTRAINT "delivery_proofs_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id");



ALTER TABLE ONLY "public"."delivery_proofs"
    ADD CONSTRAINT "delivery_proofs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."device_tokens"
    ADD CONSTRAINT "device_tokens_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."driver_assignments"
    ADD CONSTRAINT "driver_assignments_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id");



ALTER TABLE ONLY "public"."driver_assignments"
    ADD CONSTRAINT "driver_assignments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."driver_live_locations"
    ADD CONSTRAINT "driver_live_locations_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."driver_location_history"
    ADD CONSTRAINT "driver_location_history_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."driver_navigation_events"
    ADD CONSTRAINT "driver_navigation_events_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id");



ALTER TABLE ONLY "public"."driver_navigation_events"
    ADD CONSTRAINT "driver_navigation_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");



ALTER TABLE ONLY "public"."drivers"
    ADD CONSTRAINT "drivers_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."facility_employees"
    ADD CONSTRAINT "facility_employees_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."facility_employees"
    ADD CONSTRAINT "facility_employees_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."facility_machines"
    ADD CONSTRAINT "facility_machines_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id");



ALTER TABLE ONLY "public"."facility_order_operations"
    ADD CONSTRAINT "facility_order_operations_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id");



ALTER TABLE ONLY "public"."facility_order_operations"
    ADD CONSTRAINT "facility_order_operations_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "public"."facility_machines"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."facility_order_operations"
    ADD CONSTRAINT "facility_order_operations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."facility_order_operations"
    ADD CONSTRAINT "facility_order_operations_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."facility_processing_batches"
    ADD CONSTRAINT "facility_processing_batches_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id");



ALTER TABLE ONLY "public"."facility_processing_batches"
    ADD CONSTRAINT "facility_processing_batches_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "public"."facility_machines"("id");



ALTER TABLE ONLY "public"."financial_audit_logs"
    ADD CONSTRAINT "financial_audit_logs_actor_profile_id_fkey" FOREIGN KEY ("actor_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."garment_inspections"
    ADD CONSTRAINT "garment_inspections_inspected_by_fkey" FOREIGN KEY ("inspected_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."garment_inspections"
    ADD CONSTRAINT "garment_inspections_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "public"."facility_order_operations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."garment_inspections"
    ADD CONSTRAINT "garment_inspections_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."garment_inspections"
    ADD CONSTRAINT "garment_inspections_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id");



ALTER TABLE ONLY "public"."garment_inspections"
    ADD CONSTRAINT "garment_inspections_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."loyalty_point_transactions"
    ADD CONSTRAINT "loyalty_point_transactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_transactions"
    ADD CONSTRAINT "loyalty_transactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."missing_item_reports"
    ADD CONSTRAINT "missing_item_reports_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "public"."facility_order_operations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."missing_item_reports"
    ADD CONSTRAINT "missing_item_reports_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id");



ALTER TABLE ONLY "public"."notification_delivery_attempts"
    ADD CONSTRAINT "notification_delivery_attempts_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_item_photos"
    ADD CONSTRAINT "order_item_photos_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_item_photos"
    ADD CONSTRAINT "order_item_photos_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id");



ALTER TABLE ONLY "public"."order_otps"
    ADD CONSTRAINT "order_otps_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_otps"
    ADD CONSTRAINT "order_otps_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."order_qr_codes"
    ADD CONSTRAINT "order_qr_codes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_status_history"
    ADD CONSTRAINT "order_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."order_status_history"
    ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_delivery_address_id_fkey" FOREIGN KEY ("delivery_address_id") REFERENCES "public"."customer_addresses"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pickup_address_id_fkey" FOREIGN KEY ("pickup_address_id") REFERENCES "public"."customer_addresses"("id");



ALTER TABLE ONLY "public"."package_service_limits"
    ADD CONSTRAINT "package_service_limits_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."package_service_limits"
    ADD CONSTRAINT "package_service_limits_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id");



ALTER TABLE ONLY "public"."package_services"
    ADD CONSTRAINT "package_services_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."package_services"
    ADD CONSTRAINT "package_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."package_subscriptions"
    ADD CONSTRAINT "package_subscriptions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."package_subscriptions"
    ADD CONSTRAINT "package_subscriptions_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id");



ALTER TABLE ONLY "public"."package_usage"
    ADD CONSTRAINT "package_usage_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."package_usage"
    ADD CONSTRAINT "package_usage_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");



ALTER TABLE ONLY "public"."package_usage"
    ADD CONSTRAINT "package_usage_package_service_id_fkey" FOREIGN KEY ("package_service_id") REFERENCES "public"."package_services"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."package_usage"
    ADD CONSTRAINT "package_usage_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id");



ALTER TABLE ONLY "public"."package_usage"
    ADD CONSTRAINT "package_usage_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."package_subscriptions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_orders"
    ADD CONSTRAINT "payment_orders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");



ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_payment_order_id_fkey" FOREIGN KEY ("payment_order_id") REFERENCES "public"."payment_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."processing_batch_orders"
    ADD CONSTRAINT "processing_batch_orders_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."facility_processing_batches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."processing_batch_orders"
    ADD CONSTRAINT "processing_batch_orders_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "public"."facility_order_operations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_roles"
    ADD CONSTRAINT "profile_roles_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_roles"
    ADD CONSTRAINT "profile_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_devices"
    ADD CONSTRAINT "push_devices_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."qr_scan_logs"
    ADD CONSTRAINT "qr_scan_logs_qr_code_id_fkey" FOREIGN KEY ("qr_code_id") REFERENCES "public"."order_qr_codes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."qr_scan_logs"
    ADD CONSTRAINT "qr_scan_logs_scanner_profile_id_fkey" FOREIGN KEY ("scanner_profile_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."referral_codes"
    ADD CONSTRAINT "referral_codes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_referred_customer_id_fkey" FOREIGN KEY ("referred_customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_referrer_customer_id_fkey" FOREIGN KEY ("referrer_customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."refund_requests"
    ADD CONSTRAINT "refund_requests_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."refund_requests"
    ADD CONSTRAINT "refund_requests_payment_order_id_fkey" FOREIGN KEY ("payment_order_id") REFERENCES "public"."payment_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."refund_requests"
    ADD CONSTRAINT "refund_requests_payment_transaction_id_fkey" FOREIGN KEY ("payment_transaction_id") REFERENCES "public"."payment_transactions"("id");



ALTER TABLE ONLY "public"."refund_requests"
    ADD CONSTRAINT "refund_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."route_batch_stops"
    ADD CONSTRAINT "route_batch_stops_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."driver_assignments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."route_batch_stops"
    ADD CONSTRAINT "route_batch_stops_route_batch_id_fkey" FOREIGN KEY ("route_batch_id") REFERENCES "public"."route_batches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."route_batches"
    ADD CONSTRAINT "route_batches_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id");



ALTER TABLE ONLY "public"."security_events"
    ADD CONSTRAINT "security_events_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."service_prices"
    ADD CONSTRAINT "service_prices_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_prices"
    ADD CONSTRAINT "service_prices_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id");



ALTER TABLE ONLY "public"."system_configurations"
    ADD CONSTRAINT "system_configurations_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE SET NULL;



CREATE POLICY "addresses_customer_access" ON "public"."customer_addresses" USING (((EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "customer_addresses"."customer_id") AND ("c"."profile_id" = "auth"."uid"())))) OR "public"."is_admin"("auth"."uid"())));



ALTER TABLE "public"."customer_addresses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customers_self_read" ON "public"."customers" FOR SELECT USING ((("profile_id" = "auth"."uid"()) OR "public"."is_admin"("auth"."uid"())));



CREATE POLICY "devices_owner_manage" ON "public"."push_devices" USING ((("profile_id" = "auth"."uid"()) OR "public"."is_admin"("auth"."uid"()))) WITH CHECK ((("profile_id" = "auth"."uid"()) OR "public"."is_admin"("auth"."uid"())));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_owner_read" ON "public"."notifications" FOR SELECT USING ((("profile_id" = "auth"."uid"()) OR "public"."is_admin"("auth"."uid"())));



CREATE POLICY "notifications_owner_update" ON "public"."notifications" FOR UPDATE USING ((("profile_id" = "auth"."uid"()) OR "public"."is_admin"("auth"."uid"())));



ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "order_items_order_access" ON "public"."order_items" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM ("public"."orders" "o"
     JOIN "public"."customers" "c" ON (("c"."id" = "o"."customer_id")))
  WHERE (("o"."id" = "order_items"."order_id") AND ("c"."profile_id" = "auth"."uid"())))) OR "public"."is_admin"("auth"."uid"())));



ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "orders_customer_read" ON "public"."orders" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "orders"."customer_id") AND ("c"."profile_id" = "auth"."uid"())))) OR "public"."is_admin"("auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM ("public"."driver_assignments" "da"
     JOIN "public"."drivers" "d" ON (("d"."id" = "da"."driver_id")))
  WHERE (("da"."order_id" = "orders"."id") AND ("d"."profile_id" = "auth"."uid"()))))));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_self_read" ON "public"."profiles" FOR SELECT USING ((("id" = "auth"."uid"()) OR "public"."is_admin"("auth"."uid"())));



CREATE POLICY "profiles_self_update" ON "public"."profiles" FOR UPDATE USING ((("id" = "auth"."uid"()) OR "public"."is_admin"("auth"."uid"())));



ALTER TABLE "public"."push_devices" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_loyalty_transaction"() TO "anon";
GRANT ALL ON FUNCTION "public"."apply_loyalty_transaction"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_loyalty_transaction"() TO "service_role";



GRANT ALL ON FUNCTION "public"."change_order_status"("p_order_id" "uuid", "p_new_status" "public"."order_status", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."change_order_status"("p_order_id" "uuid", "p_new_status" "public"."order_status", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."change_order_status"("p_order_id" "uuid", "p_new_status" "public"."order_status", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_default_notification_preferences"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_default_notification_preferences"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_default_notification_preferences"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_refund_admin_approval"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_refund_admin_approval"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_refund_admin_approval"() TO "service_role";



GRANT ALL ON FUNCTION "public"."find_driver_assignment_candidates"("p_order_id" "uuid", "p_assignment_type" "public"."assignment_type", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."find_driver_assignment_candidates"("p_order_id" "uuid", "p_assignment_type" "public"."assignment_type", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_driver_assignment_candidates"("p_order_id" "uuid", "p_assignment_type" "public"."assignment_type", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."find_nearby_driver_jobs"("p_driver_id" "uuid", "p_radius_meters" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."find_nearby_driver_jobs"("p_driver_id" "uuid", "p_radius_meters" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_nearby_driver_jobs"("p_driver_id" "uuid", "p_radius_meters" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_order_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_order_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_order_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_customer_loyalty_balance"("p_customer_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_customer_loyalty_balance"("p_customer_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_customer_loyalty_balance"("p_customer_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_driver_live_location"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_driver_live_location"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_driver_live_location"() TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_driver_live_location"("p_driver_id" "uuid", "p_latitude" numeric, "p_longitude" numeric, "p_accuracy_m" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_driver_live_location"("p_driver_id" "uuid", "p_latitude" numeric, "p_longitude" numeric, "p_accuracy_m" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_driver_live_location"("p_driver_id" "uuid", "p_latitude" numeric, "p_longitude" numeric, "p_accuracy_m" numeric) TO "service_role";



GRANT ALL ON TABLE "public"."admin_activity_logs" TO "anon";
GRANT ALL ON TABLE "public"."admin_activity_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_activity_logs" TO "service_role";



GRANT ALL ON TABLE "public"."api_rate_limit_logs" TO "anon";
GRANT ALL ON TABLE "public"."api_rate_limit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."api_rate_limit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."backup_execution_logs" TO "anon";
GRANT ALL ON TABLE "public"."backup_execution_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."backup_execution_logs" TO "service_role";



GRANT ALL ON TABLE "public"."customer_addresses" TO "anon";
GRANT ALL ON TABLE "public"."customer_addresses" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_addresses" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."damage_reports" TO "anon";
GRANT ALL ON TABLE "public"."damage_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."damage_reports" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_proofs" TO "anon";
GRANT ALL ON TABLE "public"."delivery_proofs" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_proofs" TO "service_role";



GRANT ALL ON TABLE "public"."device_tokens" TO "anon";
GRANT ALL ON TABLE "public"."device_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."device_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."driver_assignments" TO "anon";
GRANT ALL ON TABLE "public"."driver_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."driver_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."driver_live_locations" TO "anon";
GRANT ALL ON TABLE "public"."driver_live_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."driver_live_locations" TO "service_role";



GRANT ALL ON TABLE "public"."driver_location_history" TO "anon";
GRANT ALL ON TABLE "public"."driver_location_history" TO "authenticated";
GRANT ALL ON TABLE "public"."driver_location_history" TO "service_role";



GRANT ALL ON TABLE "public"."driver_navigation_events" TO "anon";
GRANT ALL ON TABLE "public"."driver_navigation_events" TO "authenticated";
GRANT ALL ON TABLE "public"."driver_navigation_events" TO "service_role";



GRANT ALL ON TABLE "public"."drivers" TO "anon";
GRANT ALL ON TABLE "public"."drivers" TO "authenticated";
GRANT ALL ON TABLE "public"."drivers" TO "service_role";



GRANT ALL ON TABLE "public"."facilities" TO "anon";
GRANT ALL ON TABLE "public"."facilities" TO "authenticated";
GRANT ALL ON TABLE "public"."facilities" TO "service_role";



GRANT ALL ON TABLE "public"."facility_employees" TO "anon";
GRANT ALL ON TABLE "public"."facility_employees" TO "authenticated";
GRANT ALL ON TABLE "public"."facility_employees" TO "service_role";



GRANT ALL ON TABLE "public"."facility_machines" TO "anon";
GRANT ALL ON TABLE "public"."facility_machines" TO "authenticated";
GRANT ALL ON TABLE "public"."facility_machines" TO "service_role";



GRANT ALL ON TABLE "public"."facility_order_operations" TO "anon";
GRANT ALL ON TABLE "public"."facility_order_operations" TO "authenticated";
GRANT ALL ON TABLE "public"."facility_order_operations" TO "service_role";



GRANT ALL ON TABLE "public"."facility_processing_batches" TO "anon";
GRANT ALL ON TABLE "public"."facility_processing_batches" TO "authenticated";
GRANT ALL ON TABLE "public"."facility_processing_batches" TO "service_role";



GRANT ALL ON TABLE "public"."feature_flags" TO "anon";
GRANT ALL ON TABLE "public"."feature_flags" TO "authenticated";
GRANT ALL ON TABLE "public"."feature_flags" TO "service_role";



GRANT ALL ON TABLE "public"."financial_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."financial_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."financial_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."garment_inspections" TO "anon";
GRANT ALL ON TABLE "public"."garment_inspections" TO "authenticated";
GRANT ALL ON TABLE "public"."garment_inspections" TO "service_role";



GRANT ALL ON TABLE "public"."loyalty_point_transactions" TO "anon";
GRANT ALL ON TABLE "public"."loyalty_point_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_point_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."loyalty_transactions" TO "anon";
GRANT ALL ON TABLE "public"."loyalty_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."missing_item_reports" TO "anon";
GRANT ALL ON TABLE "public"."missing_item_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."missing_item_reports" TO "service_role";



GRANT ALL ON TABLE "public"."notification_delivery_attempts" TO "anon";
GRANT ALL ON TABLE "public"."notification_delivery_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_delivery_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."notification_preferences" TO "anon";
GRANT ALL ON TABLE "public"."notification_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."offers" TO "anon";
GRANT ALL ON TABLE "public"."offers" TO "authenticated";
GRANT ALL ON TABLE "public"."offers" TO "service_role";



GRANT ALL ON TABLE "public"."order_item_photos" TO "anon";
GRANT ALL ON TABLE "public"."order_item_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."order_item_photos" TO "service_role";



GRANT ALL ON TABLE "public"."order_items" TO "anon";
GRANT ALL ON TABLE "public"."order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_items" TO "service_role";



GRANT ALL ON TABLE "public"."order_otps" TO "anon";
GRANT ALL ON TABLE "public"."order_otps" TO "authenticated";
GRANT ALL ON TABLE "public"."order_otps" TO "service_role";



GRANT ALL ON TABLE "public"."order_qr_codes" TO "anon";
GRANT ALL ON TABLE "public"."order_qr_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."order_qr_codes" TO "service_role";



GRANT ALL ON TABLE "public"."order_status_history" TO "anon";
GRANT ALL ON TABLE "public"."order_status_history" TO "authenticated";
GRANT ALL ON TABLE "public"."order_status_history" TO "service_role";



GRANT ALL ON TABLE "public"."order_status_transitions" TO "anon";
GRANT ALL ON TABLE "public"."order_status_transitions" TO "authenticated";
GRANT ALL ON TABLE "public"."order_status_transitions" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."package_service_limits" TO "anon";
GRANT ALL ON TABLE "public"."package_service_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."package_service_limits" TO "service_role";



GRANT ALL ON TABLE "public"."package_services" TO "anon";
GRANT ALL ON TABLE "public"."package_services" TO "authenticated";
GRANT ALL ON TABLE "public"."package_services" TO "service_role";



GRANT ALL ON TABLE "public"."package_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."package_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."package_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."package_usage" TO "anon";
GRANT ALL ON TABLE "public"."package_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."package_usage" TO "service_role";



GRANT ALL ON TABLE "public"."packages" TO "anon";
GRANT ALL ON TABLE "public"."packages" TO "authenticated";
GRANT ALL ON TABLE "public"."packages" TO "service_role";



GRANT ALL ON TABLE "public"."payment_orders" TO "anon";
GRANT ALL ON TABLE "public"."payment_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_orders" TO "service_role";



GRANT ALL ON TABLE "public"."payment_transactions" TO "anon";
GRANT ALL ON TABLE "public"."payment_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."payment_webhook_events" TO "anon";
GRANT ALL ON TABLE "public"."payment_webhook_events" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."permissions" TO "anon";
GRANT ALL ON TABLE "public"."permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."permissions" TO "service_role";



GRANT ALL ON TABLE "public"."processing_batch_orders" TO "anon";
GRANT ALL ON TABLE "public"."processing_batch_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."processing_batch_orders" TO "service_role";



GRANT ALL ON TABLE "public"."profile_roles" TO "anon";
GRANT ALL ON TABLE "public"."profile_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."profile_roles" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."push_devices" TO "anon";
GRANT ALL ON TABLE "public"."push_devices" TO "authenticated";
GRANT ALL ON TABLE "public"."push_devices" TO "service_role";



GRANT ALL ON TABLE "public"."qr_scan_logs" TO "anon";
GRANT ALL ON TABLE "public"."qr_scan_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."qr_scan_logs" TO "service_role";



GRANT ALL ON TABLE "public"."referral_codes" TO "anon";
GRANT ALL ON TABLE "public"."referral_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."referral_codes" TO "service_role";



GRANT ALL ON TABLE "public"."referrals" TO "anon";
GRANT ALL ON TABLE "public"."referrals" TO "authenticated";
GRANT ALL ON TABLE "public"."referrals" TO "service_role";



GRANT ALL ON TABLE "public"."refund_requests" TO "anon";
GRANT ALL ON TABLE "public"."refund_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."refund_requests" TO "service_role";



GRANT ALL ON TABLE "public"."role_permissions" TO "anon";
GRANT ALL ON TABLE "public"."role_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."role_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."roles" TO "anon";
GRANT ALL ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";



GRANT ALL ON TABLE "public"."route_batch_stops" TO "anon";
GRANT ALL ON TABLE "public"."route_batch_stops" TO "authenticated";
GRANT ALL ON TABLE "public"."route_batch_stops" TO "service_role";



GRANT ALL ON TABLE "public"."route_batches" TO "anon";
GRANT ALL ON TABLE "public"."route_batches" TO "authenticated";
GRANT ALL ON TABLE "public"."route_batches" TO "service_role";



GRANT ALL ON TABLE "public"."security_events" TO "anon";
GRANT ALL ON TABLE "public"."security_events" TO "authenticated";
GRANT ALL ON TABLE "public"."security_events" TO "service_role";



GRANT ALL ON TABLE "public"."service_categories" TO "anon";
GRANT ALL ON TABLE "public"."service_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."service_categories" TO "service_role";



GRANT ALL ON TABLE "public"."service_prices" TO "anon";
GRANT ALL ON TABLE "public"."service_prices" TO "authenticated";
GRANT ALL ON TABLE "public"."service_prices" TO "service_role";



GRANT ALL ON TABLE "public"."services" TO "anon";
GRANT ALL ON TABLE "public"."services" TO "authenticated";
GRANT ALL ON TABLE "public"."services" TO "service_role";



GRANT ALL ON TABLE "public"."system_configurations" TO "anon";
GRANT ALL ON TABLE "public"."system_configurations" TO "authenticated";
GRANT ALL ON TABLE "public"."system_configurations" TO "service_role";



GRANT ALL ON TABLE "public"."vehicles" TO "anon";
GRANT ALL ON TABLE "public"."vehicles" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicles" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







