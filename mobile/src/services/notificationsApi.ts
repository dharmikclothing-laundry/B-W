import {apiRequest} from './api';

export type CustomerNotification = {
  id: string;
  notification_type: string | null;
  event_type: string | null;
  title: string;
  body: string | null;
  message: string | null;
  data: {orderId?: string; assignmentId?: string} | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
};

export async function getNotifications(accessToken: string) {
  const result = await apiRequest<CustomerNotification[]>('/notifications', {
    accessToken,
  });
  if (!Array.isArray(result)) {
    throw new Error('Unable to load notifications.');
  }
  return result;
}

export async function markNotificationRead(accessToken: string, id: string) {
  return apiRequest<CustomerNotification>(`/notifications/${id}/read`, {
    method: 'POST',
    accessToken,
  });
}

export function notificationOrderId(notification: CustomerNotification) {
  const orderId = notification.data?.orderId;
  return typeof orderId === 'string' && orderId.trim() ? orderId : null;
}
