-- Local fixture only. All lifecycle mutations are rolled back.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  target uuid;
  next_status public.order_status;
  initial_history integer;
  final_history integer;
BEGIN
  SELECT o.id INTO STRICT target FROM public.orders o
  JOIN public.order_items i ON i.order_id=o.id
  JOIN public.services s ON s.id=i.service_id
  WHERE s.name='Runtime integration test laundry' AND o.current_status='confirmed'
  ORDER BY o.created_at DESC LIMIT 1;
  IF has_function_privilege('anon','public.change_order_status(uuid,public.order_status,text)','EXECUTE')
     OR has_function_privilege('authenticated','public.change_order_status(uuid,public.order_status,text)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.change_order_status(uuid,public.order_status,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Unexpected lifecycle grants';
  END IF;
  SELECT count(*) INTO initial_history FROM public.order_status_history WHERE order_id=target;
  BEGIN
    PERFORM public.change_order_status(target,'delivered','Invalid jump test');
    RAISE EXCEPTION 'Invalid transition was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.orders SET current_status='delivered' WHERE id=target;
    RAISE EXCEPTION 'Direct invalid update was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='Direct invalid update was accepted' THEN RAISE; END IF;
  WHEN check_violation THEN NULL;
  END;
  FOREACH next_status IN ARRAY ARRAY[
    'pickup_assigned','pickup_accepted','en_route_pickup','pickup_otp_pending','picked_up',
    'in_transit_to_facility','received_at_facility','verification','processing','quality_check',
    'ready_for_delivery','delivery_assigned','delivery_accepted','en_route_delivery',
    'delivery_otp_pending','delivered','claim_period_active','completed'
  ]::public.order_status[] LOOP
    PERFORM public.change_order_status(target,next_status,'Local runtime C2 validation');
  END LOOP;
  PERFORM public.change_order_status(target,'completed','Idempotency check');
  SELECT count(*) INTO final_history FROM public.order_status_history WHERE order_id=target;
  IF final_history <> initial_history+18 THEN RAISE EXCEPTION 'Unexpected status history count'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id=target AND current_status='completed'
    AND delivered_at IS NOT NULL AND claim_deadline_at=delivered_at+interval '7 days') THEN
    RAISE EXCEPTION 'Delivery or claim deadline mismatch';
  END IF;
  RAISE NOTICE 'PASS C2: 18 transitions, invalid RPC/direct update rejection, same-state idempotency, history, delivery timestamps and unchanged grants';
END $$;
ROLLBACK;
