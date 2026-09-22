-- Driver assignment rejection is an offer decision, not an order cancellation.
-- Customer absence is recorded only after arrival: pickups are cancelled and
-- refunded through the existing cancellation function, while deliveries are
-- deferred to the following India-local day.

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS delivery_scheduled_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_delivery_scheduled_at
ON public.orders(delivery_scheduled_at)
WHERE delivery_scheduled_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.find_driver_assignment_candidates(
  p_order_id uuid, p_assignment_type public.assignment_type, p_limit integer DEFAULT 12
)
RETURNS TABLE(driver_id uuid,driver_latitude numeric,driver_longitude numeric,target_latitude numeric,target_longitude numeric,active_workload bigint,route_compatibility numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH target AS (
    SELECT CASE WHEN p_assignment_type='pickup' THEN ca_pick.location ELSE ca_drop.location END AS location
    FROM public.orders o
    JOIN public.customer_addresses ca_pick ON ca_pick.id=o.pickup_address_id
    JOIN public.customer_addresses ca_drop ON ca_drop.id=o.delivery_address_id
    WHERE o.id=p_order_id
  ), workloads AS (
    SELECT driver_id,count(*)::bigint active_workload FROM public.driver_assignments
    WHERE status::text IN ('assigned','accepted','en_route','arrived') GROUP BY driver_id
  )
  SELECT d.id, dll.latitude, dll.longitude,
    ST_Y(t.location::geometry)::numeric, ST_X(t.location::geometry)::numeric,
    COALESCE(w.active_workload,0),0::numeric
  FROM public.drivers d JOIN public.driver_live_locations dll ON dll.driver_id=d.id
  CROSS JOIN target t LEFT JOIN workloads w ON w.driver_id=d.id
  WHERE d.is_active=true AND d.is_available=true
    AND dll.location IS NOT NULL AND t.location IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.driver_assignments prior
      WHERE prior.order_id=p_order_id
        AND prior.assignment_type=p_assignment_type
        AND prior.driver_id=d.id
        AND prior.status='rejected'::public.assignment_status
    )
  ORDER BY dll.location <-> t.location LIMIT GREATEST(1,LEAST(p_limit,50));
$$;

CREATE OR REPLACE FUNCTION public.resolve_driver_customer_unavailable_atomic(
  p_assignment_id uuid,
  p_driver_id uuid,
  p_outcome text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_assignment public.driver_assignments%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_customer_profile_id uuid;
  v_driver_profile_id uuid;
  v_reason text;
  v_notification_id uuid;
  v_delivery_at timestamptz;
  v_cancel_result jsonb;
BEGIN
  IF p_outcome NOT IN ('customer_not_home', 'customer_not_answering') THEN
    RAISE EXCEPTION 'Select a valid customer availability outcome'
      USING ERRCODE = '22023';
  END IF;

  SELECT assignment.* INTO v_assignment
  FROM public.driver_assignments assignment
  WHERE assignment.id=p_assignment_id AND assignment.driver_id=p_driver_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignment not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_assignment.status <> 'arrived'::public.assignment_status THEN
    RAISE EXCEPTION 'Customer availability can be reported only after arrival'
      USING ERRCODE = '23514';
  END IF;

  SELECT orders.* INTO v_order
  FROM public.orders orders
  WHERE orders.id=v_assignment.order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT profile_id INTO v_customer_profile_id
  FROM public.customers WHERE id=v_order.customer_id;

  SELECT profile_id INTO v_driver_profile_id
  FROM public.drivers WHERE id=p_driver_id;

  v_reason := CASE p_outcome
    WHEN 'customer_not_home' THEN 'Customer was not at home'
    ELSE 'Customer did not answer calls'
  END;

  IF v_assignment.assignment_type='pickup'::public.assignment_type THEN
    IF v_order.current_status <> 'pickup_otp_pending'::public.order_status THEN
      RAISE EXCEPTION 'Pickup can no longer be cancelled from this assignment'
        USING ERRCODE = '23514';
    END IF;

    v_cancel_result := public.cancel_customer_order_atomic(
      v_order.id, v_customer_profile_id, v_reason
    );

    SELECT assignment.* INTO v_assignment
    FROM public.driver_assignments assignment
    WHERE assignment.id=p_assignment_id AND assignment.driver_id=p_driver_id
    FOR UPDATE;

    IF NOT FOUND OR v_assignment.status <> 'arrived'::public.assignment_status THEN
      RAISE EXCEPTION 'Assignment changed while cancellation was processed'
        USING ERRCODE = '40001';
    END IF;

    UPDATE public.driver_assignments
    SET status='cancelled'::public.assignment_status,
        completed_at=transaction_timestamp(), rejection_reason=v_reason
    WHERE id=v_assignment.id;

    UPDATE public.order_status_history history
    SET changed_by=v_driver_profile_id
    WHERE history.id=(
      SELECT candidate.id FROM public.order_status_history candidate
      WHERE candidate.order_id=v_order.id
        AND candidate.to_status='cancelled'::public.order_status
      ORDER BY candidate.created_at DESC, candidate.id DESC LIMIT 1
    );

    INSERT INTO public.notifications(
      profile_id,order_id,event_type,notification_type,title,message,body,data,status
    ) VALUES (
      v_customer_profile_id,v_order.id,'pickup_cancelled','pickup_cancelled',
      'Pickup cancelled',v_reason,v_reason,
      jsonb_build_object('orderId',v_order.id,'outcome',p_outcome),'queued'
    ) RETURNING id INTO v_notification_id;

    RETURN jsonb_build_object(
      'assignmentId',v_assignment.id,'orderId',v_order.id,
      'assignmentType','pickup','outcome',p_outcome,'orderStatus','cancelled',
      'notificationId',v_notification_id,'refund',v_cancel_result
    );
  END IF;

  IF v_order.current_status <> 'delivery_otp_pending'::public.order_status THEN
    RAISE EXCEPTION 'Delivery can no longer be deferred from this assignment'
      USING ERRCODE = '23514';
  END IF;

  SELECT orders.* INTO v_order
  FROM public.orders orders
  WHERE orders.id=v_assignment.order_id
  FOR UPDATE;

  SELECT assignment.* INTO v_assignment
  FROM public.driver_assignments assignment
  WHERE assignment.id=p_assignment_id AND assignment.driver_id=p_driver_id
  FOR UPDATE;

  IF v_order.current_status <> 'delivery_otp_pending'::public.order_status
     OR v_assignment.status <> 'arrived'::public.assignment_status THEN
    RAISE EXCEPTION 'Delivery assignment changed concurrently'
      USING ERRCODE = '40001';
  END IF;

  v_delivery_at := (
    date_trunc('day', transaction_timestamp() AT TIME ZONE 'Asia/Kolkata')
    + interval '1 day'
  ) AT TIME ZONE 'Asia/Kolkata';

  UPDATE public.driver_assignments
  SET status='cancelled'::public.assignment_status,
      completed_at=transaction_timestamp(), rejection_reason=v_reason
  WHERE id=v_assignment.id;

  PERFORM public.change_order_status(
    v_order.id,'delivery_failed'::public.order_status,
    format('Delivery deferred until tomorrow: %s',v_reason)
  );

  UPDATE public.orders SET delivery_scheduled_at=v_delivery_at WHERE id=v_order.id;

  UPDATE public.order_status_history history
  SET changed_by=v_driver_profile_id
  WHERE history.id=(
    SELECT candidate.id FROM public.order_status_history candidate
    WHERE candidate.order_id=v_order.id
      AND candidate.to_status='delivery_failed'::public.order_status
    ORDER BY candidate.created_at DESC, candidate.id DESC LIMIT 1
  );

  INSERT INTO public.notifications(
    profile_id,order_id,event_type,notification_type,title,message,body,data,status
  ) VALUES (
    v_customer_profile_id,v_order.id,'delivery_rescheduled','delivery_rescheduled',
    'Delivery rescheduled',
    format('%s. We will deliver your order tomorrow.',v_reason),
    format('%s. We will deliver your order tomorrow.',v_reason),
    jsonb_build_object('orderId',v_order.id,'outcome',p_outcome,
      'deliveryScheduledAt',v_delivery_at),'queued'
  ) RETURNING id INTO v_notification_id;

  RETURN jsonb_build_object(
    'assignmentId',v_assignment.id,'orderId',v_order.id,
    'assignmentType','delivery','outcome',p_outcome,'orderStatus','delivery_failed',
    'deliveryScheduledAt',v_delivery_at,'notificationId',v_notification_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_driver_customer_unavailable_atomic(uuid,uuid,text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_driver_customer_unavailable_atomic(uuid,uuid,text)
TO service_role;
GRANT EXECUTE ON FUNCTION public.find_driver_assignment_candidates(uuid,public.assignment_type,integer)
TO service_role;
