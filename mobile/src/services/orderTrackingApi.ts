import {apiRequest} from './api';

export type DriverAssignmentTracking = {
  id: string;
  type: 'pickup' | 'delivery';
  status: string;
  assignedAt: string | null;
  acceptedAt: string | null;
};

export type DriverLocationTracking = {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  recordedAt: string | null;
  stale: boolean;
};

export type OrderTracking = {
  orderId: string;
  orderStatus: string;
  assignment: DriverAssignmentTracking | null;
  location: DriverLocationTracking | null;
  distanceMeters: number | null;
  etaMinutes: number | null;
};

const TRACKING_STATUSES = new Set([
  'pickup_assigned',
  'pickup_accepted',
  'en_route_pickup',
  'pickup_otp_pending',
  'delivery_assigned',
  'delivery_accepted',
  'en_route_delivery',
  'delivery_otp_pending',
]);

const LIVE_LOCATION_STATUSES = new Set([
  'en_route_pickup',
  'pickup_otp_pending',
  'en_route_delivery',
  'delivery_otp_pending',
]);

export function canCustomerTrackOrder(status: string) {
  return TRACKING_STATUSES.has(status);
}

export function hasLiveDriverLocation(status: string) {
  return LIVE_LOCATION_STATUSES.has(status);
}

export async function getOrderTracking(
  accessToken: string,
  orderId: string,
): Promise<OrderTracking> {
  const tracking = await apiRequest<OrderTracking>(
    `/orders/${orderId}/tracking`,
    {accessToken},
  );

  if (
    !tracking ||
    tracking.orderId !== orderId ||
    typeof tracking.orderStatus !== 'string'
  ) {
    throw new Error('Unable to load order tracking.');
  }

  return tracking;
}
