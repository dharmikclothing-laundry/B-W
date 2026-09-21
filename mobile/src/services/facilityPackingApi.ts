import { apiRequest } from './api';

export type PackingItem = {
  id: string;
  item_name: string;
  quantity: number;
  verifiedQuantity: number | null;
};
export type PackingRecord = {
  id: string;
  parcel_id: string;
  cycle_number: number;
  packed_by: string;
  packed_at: string;
  notes: string | null;
  items: Array<{
    order_item_id: string;
    verified_quantity: number;
    packed_quantity: number;
  }>;
};
export type PackingDetails = {
  orderId: string;
  orderStatus: string;
  facility: string;
  cycleNumber: number;
  canPack: boolean;
  packingRequired: boolean;
  items: PackingItem[];
  history: PackingRecord[];
};

export function getFacilityPacking(accessToken: string, orderId: string) {
  return apiRequest<PackingDetails>(
    `/facility/orders/${encodeURIComponent(orderId)}/packing`,
    { accessToken },
  );
}
export function confirmFacilityPacking(
  accessToken: string,
  orderId: string,
  items: Array<{ orderItemId: string; packedQuantity: number }>,
  notes: string,
) {
  return apiRequest<{
    packingId: string;
    parcelId: string;
    packedCount: number;
  }>(`/facility/orders/${encodeURIComponent(orderId)}/packing`, {
    accessToken,
    method: 'POST',
    body: { items, notes },
  });
}
