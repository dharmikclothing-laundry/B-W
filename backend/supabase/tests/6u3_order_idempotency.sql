BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(3);

DO $$
DECLARE v_profile uuid; v_customer uuid; v_address uuid; v_service uuid;
  v_order uuid; v_key uuid := gen_random_uuid(); v_duplicate boolean := false;
BEGIN
  INSERT INTO auth.users
    (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
     raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES
    (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', '6u3-' || gen_random_uuid()::text || '@example.test',
     '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
  RETURNING id INTO v_profile;
  INSERT INTO public.customers(profile_id, referral_code)
    VALUES(v_profile, '6U3' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)))
    RETURNING id INTO v_customer;
  INSERT INTO public.customer_addresses(customer_id, address_line1)
    VALUES(v_customer, 'Local test address') RETURNING id INTO v_address;
  INSERT INTO public.services(name) VALUES('6U3 local test service') RETURNING id INTO v_service;

  v_order := public.create_customer_order_with_rewards_atomic(
    v_customer,
    jsonb_build_object(
      'pickup_address_id', v_address, 'delivery_address_id', v_address,
      'pickup_scheduled_at', now() + interval '1 day', 'pickup_slot_label', 'Morning',
      'subtotal', 100, 'discount_amount', 0, 'loyalty_discount_amount', 0,
      'pickup_delivery_charge', 50, 'taxable_amount', 150, 'gst_rate', 5,
      'gst_amount', 7.5, 'total_amount', 157.5,
      'payment_method', 'cash_on_delivery', 'terms_version', '6u3-local-test',
      'idempotency_key', v_key, 'idempotency_request_hash', repeat('a', 64)),
    jsonb_build_array(jsonb_build_object(
      'service_id', v_service, 'item_name', 'Test item', 'quantity', 1,
      'unit_price', 100, 'line_total', 100)),
    'confirmed', 0);
  BEGIN
    PERFORM public.create_customer_order_with_rewards_atomic(
      v_customer,
      jsonb_build_object(
        'pickup_address_id', v_address, 'delivery_address_id', v_address,
        'pickup_scheduled_at', now() + interval '1 day', 'pickup_slot_label', 'Morning',
        'subtotal', 100, 'discount_amount', 0, 'loyalty_discount_amount', 0,
        'pickup_delivery_charge', 50, 'taxable_amount', 150, 'gst_rate', 5,
        'gst_amount', 7.5, 'total_amount', 157.5,
        'payment_method', 'cash_on_delivery', 'terms_version', '6u3-local-test',
        'idempotency_key', v_key, 'idempotency_request_hash', repeat('a', 64)),
      jsonb_build_array(jsonb_build_object(
        'service_id', v_service, 'item_name', 'Test item', 'quantity', 1,
        'unit_price', 100, 'line_total', 100)),
      'confirmed', 0);
  EXCEPTION WHEN unique_violation THEN
    v_duplicate := true;
  END;
  PERFORM set_config('bw6u3.customer', v_customer::text, true);
  PERFORM set_config('bw6u3.key', v_key::text, true);
  PERFORM set_config('bw6u3.order', v_order::text, true);
  PERFORM set_config('bw6u3.duplicate', v_duplicate::text, true);
END;
$$;

SELECT ok(current_setting('bw6u3.duplicate')::boolean,
  'same customer and retry key cannot create a second order');
SELECT is((SELECT count(*)::integer FROM public.orders WHERE customer_id = current_setting('bw6u3.customer')::uuid
  AND idempotency_key = current_setting('bw6u3.key')::uuid), 1,
  'one order remains for a repeated key');
SELECT is((SELECT current_status::text FROM public.orders WHERE id = current_setting('bw6u3.order')::uuid),
  'confirmed', 'order used the approved transition');
SELECT * FROM finish();
ROLLBACK;
