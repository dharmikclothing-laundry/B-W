-- Phase 4 support objects. Apply only after verifying that objects do not already
-- exist in the consolidated Bright & White master schema.
CREATE OR REPLACE FUNCTION public.get_customer_loyalty_balance(p_customer_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE(SUM(points),0) FROM public.loyalty_point_transactions WHERE customer_id=p_customer_id;
$$;

-- Recommended idempotency indexes.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_webhook_provider_event
ON public.payment_webhook_events(provider,provider_event_id);

CREATE INDEX IF NOT EXISTS idx_notifications_profile_created
ON public.notifications(profile_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_orders_order ON public.payment_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_status ON public.refund_requests(status);

-- Production RLS principle: clients may access only their own notifications and
-- payment data. Service-role backend performs provider reconciliation.
