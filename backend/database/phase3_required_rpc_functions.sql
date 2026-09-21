-- Bright & White Phase 3 backend RPC support.
-- Apply after bright_white_master_schema_v1_0.sql.

CREATE OR REPLACE FUNCTION public.upsert_driver_live_location(
  p_driver_id uuid,
  p_latitude numeric,
  p_longitude numeric,
  p_accuracy_m numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
BEGIN
  INSERT INTO public.driver_live_locations(driver_id, location, accuracy_m, updated_at)
  VALUES (
    p_driver_id,
    ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography,
    p_accuracy_m,
    now()
  )
  ON CONFLICT (driver_id)
  DO UPDATE SET location=EXCLUDED.location, accuracy_m=EXCLUDED.accuracy_m, updated_at=now();
END $$;

CREATE OR REPLACE FUNCTION public.find_driver_assignment_candidates(
  p_order_id uuid,
  p_assignment_type public.assignment_type,
  p_limit integer DEFAULT 12
)
RETURNS TABLE(
  driver_id uuid,
  driver_latitude numeric,
  driver_longitude numeric,
  target_latitude numeric,
  target_longitude numeric,
  active_workload bigint,
  route_compatibility numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$
  WITH target AS (
    SELECT CASE WHEN p_assignment_type='pickup' THEN ca_pick.location ELSE ca_drop.location END AS location
    FROM public.orders o
    JOIN public.customer_addresses ca_pick ON ca_pick.id=o.pickup_address_id
    JOIN public.customer_addresses ca_drop ON ca_drop.id=o.delivery_address_id
    WHERE o.id=p_order_id
  ),
  workloads AS (
    SELECT driver_id, count(*)::bigint AS active_workload
    FROM public.driver_assignments
    WHERE status IN ('assigned','accepted','en_route')
    GROUP BY driver_id
  )
  SELECT
    d.id,
    ST_Y(dll.location::geometry)::numeric,
    ST_X(dll.location::geometry)::numeric,
    ST_Y(t.location::geometry)::numeric,
    ST_X(t.location::geometry)::numeric,
    COALESCE(w.active_workload,0),
    0::numeric
  FROM public.drivers d
  JOIN public.driver_live_locations dll ON dll.driver_id=d.id
  CROSS JOIN target t
  LEFT JOIN workloads w ON w.driver_id=d.id
  WHERE d.is_available=true
  ORDER BY dll.location <-> t.location
  LIMIT GREATEST(1, LEAST(p_limit,50));
$$;

CREATE OR REPLACE FUNCTION public.find_nearby_driver_jobs(
  p_driver_id uuid,
  p_radius_meters numeric DEFAULT 3000
)
RETURNS TABLE(order_id uuid, assignment_id uuid, assignment_type public.assignment_type, distance_meters numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$
  SELECT da.order_id, da.id, da.assignment_type,
         ST_Distance(dll.location, ca.location)::numeric
  FROM public.driver_live_locations dll
  JOIN public.driver_assignments da ON da.driver_id=p_driver_id
  JOIN public.orders o ON o.id=da.order_id
  JOIN public.customer_addresses ca ON ca.id=CASE WHEN da.assignment_type='pickup' THEN o.pickup_address_id ELSE o.delivery_address_id END
  WHERE dll.driver_id=p_driver_id
    AND da.status IN ('assigned','accepted','en_route')
    AND ST_DWithin(dll.location, ca.location, p_radius_meters)
  ORDER BY ST_Distance(dll.location, ca.location);
$$;

GRANT EXECUTE ON FUNCTION public.upsert_driver_live_location(uuid,numeric,numeric,numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.find_driver_assignment_candidates(uuid,public.assignment_type,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.find_nearby_driver_jobs(uuid,numeric) TO service_role;
