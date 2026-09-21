import {apiRequest} from './api';

export type IntakePreview = {
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  facility: {id: string; name: string};
  items: Array<{item_name: string; quantity: number; weight_kg: number | null}>;
};

export type IntakeReceipt = {orderId: string; operationId: string; facilityStatus: string; orderStatus: string; received: boolean};

export function previewFacilityReceipt(accessToken: string, token: string) {
  return apiRequest<IntakePreview>('/facility/receive/preview', {accessToken, method: 'POST', body: {token}});
}

export function confirmFacilityReceipt(accessToken: string, token: string) {
  return apiRequest<IntakeReceipt>('/facility/receive/qr', {accessToken, method: 'POST', body: {token}});
}
