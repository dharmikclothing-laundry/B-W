BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(4);

DO $$
DECLARE v_profile uuid; v_customer uuid; v_address uuid; v_service uuid; v_order uuid;
BEGIN
  INSERT INTO auth.users
    (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
     raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES
    (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', '6r-' || gen_random_uuid()::text || '@example.test',
     '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
  RETURNING id INTO v_profile;
  INSERT INTO public.customers(profile_id, referral_code)
    VALUES(v_profile, '6R' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)))
    RETURNING id INTO v_customer;
  INSERT INTO public.customer_addresses(customer_id, address_line1)
    VALUES(v_customer, 'Local test address') RETURNING id INTO v_address;
  INSERT INTO public.services(name) VALUES('6R local test service') RETURNING id INTO v_service;
  INSERT INTO public.loyalty_point_transactions
    (customer_id, points, transaction_type, reason)
    VALUES(v_customer, 2000, 'earned', 'Local test fixture');

  v_order := public.create_customer_order_with_rewards_atomic(
    v_customer,
    jsonb_build_object(
      'pickup_address_id', v_address, 'delivery_address_id', v_address,
      'pickup_scheduled_at', now() + interval '1 day', 'pickup_slot_label', 'Morning',
      'subtotal', 100, 'discount_amount', 10, 'loyalty_discount_amount', 10,
      'pickup_delivery_charge', 50, 'taxable_amount', 140, 'gst_rate', 5,
      'gst_amount', 7, 'total_amount', 147,
      'payment_method', 'cash_on_delivery', 'terms_version', '6r-local-test'),
    jsonb_build_array(jsonb_build_object(
      'service_id', v_service, 'item_name', 'Test item', 'quantity', 1,
      'unit_price', 100, 'line_total', 100)),
    'confirmed', 1000);
  PERFORM set_config('bw6r.customer', v_customer::text, true);
  PERFORM set_config('bw6r.order', v_order::text, true);
END;
$$;

SELECT ok((SELECT current_status::text = 'confirmed' FROM public.orders
  WHERE id = current_setting('bw6r.order')::uuid), 'order used approved status transition');
SELECT is((SELECT loyalty_points_redeemed FROM public.orders
  WHERE id = current_setting('bw6r.order')::uuid), 1000, 'points attached to priced order');
SELECT is((SELECT COALESCE(SUM(points), 0)::integer FROM public.loyalty_point_transactions
  WHERE customer_id = current_setting('bw6r.customer')::uuid), 1000, 'points deducted once');

SELECT public.change_order_status(current_setting('bw6r.order')::uuid, 'cancelled', 'Local test cancellation');
SELECT is((SELECT COALESCE(SUM(points), 0)::integer FROM public.loyalty_point_transactions
  WHERE customer_id = current_setting('bw6r.customer')::uuid), 2000, 'cancellation restores points');
SELECT * FROM finish();
ROLLBACK;
