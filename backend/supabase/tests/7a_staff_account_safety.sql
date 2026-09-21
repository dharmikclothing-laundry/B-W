BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(4);

SELECT is(has_column_privilege('authenticated', 'public.profiles', 'is_active', 'UPDATE'), false,
  'authenticated users cannot reactivate their own profile');
SELECT is(has_column_privilege('authenticated', 'public.profiles', 'full_name', 'UPDATE'), true,
  'authenticated users retain display-name editing');

DO $$
DECLARE staff_id uuid := gen_random_uuid(); customer_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES (staff_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    '7a-staff-' || staff_id::text || '@example.test', '', now(), '{}',
    '{"bw_staff_provisioning":true,"full_name":"Fictional Driver"}', now(), now()),
  (customer_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    '7a-customer-' || customer_id::text || '@example.test', '', now(), '{}', '{}', now(), now());
  PERFORM set_config('bw7a.staff_id', staff_id::text, true);
  PERFORM set_config('bw7a.customer_id', customer_id::text, true);
END $$;

SELECT is((SELECT is_active FROM public.profiles WHERE id = current_setting('bw7a.staff_id')::uuid), false,
  'Admin-provisioned staff identity starts inactive');
SELECT is((SELECT is_active FROM public.profiles WHERE id = current_setting('bw7a.customer_id')::uuid), true,
  'customer signup remains active');

SELECT * FROM finish();
ROLLBACK;
