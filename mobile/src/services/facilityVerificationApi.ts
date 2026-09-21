import {apiRequest} from './api';

export type IntakeItem = {id: string; item_name: string; quantity: number; weight_kg: number | null};
export type IntakeDiscrepancy = {id: string; order_item_id: string; kind: string; notes: string;
  status: 'open' | 'resolved'; expected_quantity: number; counted_quantity: number;
  expected_weight_kg: number | null; measured_weight_kg: number | null;
  created_at: string; resolved_at: string | null; resolution_notes: string | null};
export type FacilityIntakeDetails = {
  orderId: string; orderNumber: string; orderStatus: string;
  facility: {id: string; name: string}; role: 'facility_employee' | 'manager';
  items: IntakeItem[];
  inspections: Array<{id: string; order_item_id: string; counted_quantity: number; weight_kg: number | null; condition_notes: string | null}>;
  discrepancies: IntakeDiscrepancy[];
};
export type ItemMeasurement = {orderItemId: string; countedQuantity: number; weightKg?: number | null; damaged?: boolean; notes?: string};

export function getFacilityIntake(accessToken: string, orderId: string) {
  return apiRequest<FacilityIntakeDetails>(`/facility/orders/${encodeURIComponent(orderId)}/intake`, {accessToken});
}

export function verifyFacilityIntake(accessToken: string, orderId: string, items: ItemMeasurement[], notes: string) {
  return apiRequest<{orderId: string; verified: boolean; discrepancyCount: number}>(
    `/facility/orders/${encodeURIComponent(orderId)}/intake-verify`,
    {accessToken, method: 'POST', body: {items, notes}},
  );
}

export function resolveFacilityDiscrepancy(accessToken: string, orderId: string, discrepancyId: string, notes: string) {
  return apiRequest(`/facility/orders/${encodeURIComponent(orderId)}/intake-discrepancies/${encodeURIComponent(discrepancyId)}/resolve`,
    {accessToken, method: 'PATCH', body: {notes}});
}
