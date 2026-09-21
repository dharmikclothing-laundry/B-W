import {apiRequest} from './api';
export type OrderQr = {orderId: string; token: string; payload: string};
export async function getCustomerOrderQr(accessToken: string, orderId: string): Promise<OrderQr> {
  const result = await apiRequest<OrderQr>(`/qr/orders/${encodeURIComponent(orderId)}`, {accessToken});
  if (!result?.payload?.startsWith('BW1:') || result.orderId !== orderId) throw new Error('Order QR is unavailable.');
  return result;
}
