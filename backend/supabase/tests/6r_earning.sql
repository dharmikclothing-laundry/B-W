BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(3);

DO $$
DECLARE v_profile uuid; v_customer uuid; v_address uuid; v_service uuid; v_order uuid;
  v_status public.order_status;
BEGIN
  INSERT INTO auth.users
    (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
     raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES
    (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', '6r-earn-' || gen_random_uuid()::text || '@example.test',
     '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
  RETURNING id INTO v_profile;
  INSERT INTO public.customers(profile_id, referral_code)
    VALUES(v_profile, '6RE' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)))
    RETURNING id INTO v_customer;
  INSERT INTO public.customer_addresses(customer_id, address_line1)
    VALUES(v_customer, 'Local earn test address') RETURNING id INTO v_address;
  INSERT INTO public.services(name) VALUES('6R local earn test service') RETURNING id INTO v_service;
  v_order := public.create_customer_order_with_rewards_atomic(
    v_customer,
    jsonb_build_object(
      'pickup_address_id', v_address, 'delivery_address_id', v_address,
      'pickup_scheduled_at', now() + interval '1 day', 'pickup_slot_label', 'Morning',
      'subtotal', 200, 'discount_amount', 0, 'pickup_delivery_charge', 50,
      'taxable_amount', 250, 'gst_rate', 5, 'gst_amount', 12.5,
      'total_amount', 262.5, 'payment_method', 'cash_on_delivery',
      'terms_version', '6r-local-test'),
    jsonb_build_array(jsonb_build_object(
      'service_id', v_service, 'item_name', 'Test item', 'quantity', 1,
      'unit_price', 200, 'line_total', 200)),
    'confirmed', 0);
  PERFORM set_config('bw6r.earn.customer', v_customer::text, true);
  PERFORM set_config('bw6r.earn.order', v_order::text, true);
END;
$$;

SELECT is((SELECT count(*) FROM public.loyalty_point_transactions
  WHERE customer_id = current_setting('bw6r.earn.customer')::uuid), 0::bigint,
  'points are not earned before delivery');

DO $$
DECLARE v_status public.order_status;
BEGIN
  FOREACH v_status IN ARRAY ARRAY[
    'pickup_assigned', 'pickup_accepted', 'en_route_pickup', 'pickup_otp_pending',
    'picked_up', 'in_transit_to_facility', 'received_at_facility', 'verification',
    'processing', 'quality_check', 'ready_for_delivery', 'delivery_assigned',
    'delivery_accepted', 'en_route_delivery', 'delivery_otp_pending', 'delivered'
  ]::public.order_status[] LOOP
    PERFORM public.change_order_status(current_setting('bw6r.earn.order')::uuid,
      v_status, '6R local earn test');
  END LOOP;
END;
$$;

SELECT is((SELECT COALESCE(SUM(points), 0)::integer FROM public.loyalty_point_transactions
  WHERE customer_id = current_setting('bw6r.earn.customer')::uuid), 2,
  '₹262.50 paid and delivered earns two whole points');
SELECT public.award_customer_order_loyalty_points(current_setting('bw6r.earn.order')::uuid);
SELECT is((SELECT count(*) FROM public.loyalty_point_transactions
  WHERE customer_id = current_setting('bw6r.earn.customer')::uuid
    AND transaction_type = 'earned'), 1::bigint, 'earn is idempotent');
SELECT * FROM finish();
ROLLBACK;
