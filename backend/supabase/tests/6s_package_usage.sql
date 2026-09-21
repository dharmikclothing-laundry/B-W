BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(5);

DO $$
DECLARE v_profile uuid; v_customer uuid; v_address uuid; v_service uuid;
  v_package uuid; v_subscription uuid; v_order uuid;
  v_order_data jsonb; v_items jsonb; v_coverages jsonb;
BEGIN
  INSERT INTO auth.users
    (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
     raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES
    (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', '6s-' || gen_random_uuid()::text || '@example.test',
     '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
  RETURNING id INTO v_profile;
  INSERT INTO public.customers(profile_id, referral_code)
    VALUES(v_profile, '6S' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)))
    RETURNING id INTO v_customer;
  INSERT INTO public.customer_addresses(customer_id, address_line1)
    VALUES(v_customer, 'Local package address') RETURNING id INTO v_address;
  INSERT INTO public.services(name) VALUES('6S local package service') RETURNING id INTO v_service;
  INSERT INTO public.packages(name, monthly_price)
    VALUES('6S local package ' || gen_random_uuid()::text, 99) RETURNING id INTO v_package;
  INSERT INTO public.package_services(package_id, service_id, usage_limit)
    VALUES(v_package, v_service, 1);
  INSERT INTO public.package_subscriptions
    (customer_id, package_id, status, starts_at, expires_at, started_at, amount, payment_provider)
    VALUES(v_customer, v_package, 'active', now(), now() + interval '1 month', now(), 99, 'mock')
    RETURNING id INTO v_subscription;

  v_order_data := jsonb_build_object(
    'pickup_address_id', v_address, 'delivery_address_id', v_address,
    'pickup_scheduled_at', now() + interval '1 day', 'pickup_slot_label', 'Morning',
    'subtotal', 100, 'discount_amount', 100, 'package_discount_amount', 100,
    'loyalty_discount_amount', 0, 'pickup_delivery_charge', 50,
    'taxable_amount', 50, 'gst_rate', 5, 'gst_amount', 2.5,
    'total_amount', 52.5, 'payment_method', 'cash_on_delivery',
    'terms_version', '6s-local-test');
  v_items := jsonb_build_array(jsonb_build_object(
    'service_id', v_service, 'item_name', 'Test item', 'quantity', 1,
    'unit_price', 100, 'line_total', 100));
  v_coverages := jsonb_build_array(jsonb_build_object('service_id', v_service, 'quantity', 1));
  v_order := public.create_customer_order_with_package_atomic(
    v_customer, v_order_data, v_items, 'confirmed', 0, v_subscription, v_coverages);
  PERFORM set_config('bw6s.customer', v_customer::text, true);
  PERFORM set_config('bw6s.subscription', v_subscription::text, true);
  PERFORM set_config('bw6s.order', v_order::text, true);
  BEGIN
    PERFORM public.create_customer_order_with_package_atomic(
      v_customer, v_order_data, v_items, 'confirmed', 0, v_subscription, v_coverages);
    RAISE EXCEPTION 'Second package order unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'Package balance is insufficient' THEN RAISE; END IF;
    PERFORM set_config('bw6s.double', 'rejected', true);
  END;
END;
$$;

SELECT is((SELECT total_amount FROM public.orders WHERE id = current_setting('bw6s.order')::uuid),
  52.50::numeric, 'package credit reduced the order total');
SELECT is((SELECT count(*) FROM public.package_usage
  WHERE subscription_id = current_setting('bw6s.subscription')::uuid
    AND reversed_at IS NULL), 1::bigint, 'one package credit consumed');
SELECT is(current_setting('bw6s.double'), 'rejected', 'double consumption rejected');
SELECT public.change_order_status(current_setting('bw6s.order')::uuid, 'cancelled', '6S local test');
SELECT is((SELECT count(*) FROM public.package_usage
  WHERE subscription_id = current_setting('bw6s.subscription')::uuid
    AND reversed_at IS NULL), 0::bigint, 'cancelled order releases credit');
SELECT is((SELECT count(*) FROM public.package_usage
  WHERE subscription_id = current_setting('bw6s.subscription')::uuid
    AND reversed_at IS NOT NULL), 1::bigint, 'usage history records restoration');
SELECT * FROM finish();
ROLLBACK;
