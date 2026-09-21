import {getDriverJob} from './driverAssignmentsApi';
import {CustomerNotification, markNotificationRead} from './notificationsApi';

const ACTIVE = ['assigned', 'accepted', 'en_route', 'arrived'];
const RELEVANT: Record<'pickup' | 'delivery', string[]> = {
  pickup: ['pickup_assigned', 'pickup_accepted', 'en_route_pickup', 'pickup_otp_pending', 'picked_up', 'in_transit_to_facility'],
  delivery: ['delivery_assigned', 'delivery_accepted', 'en_route_delivery', 'delivery_otp_pending'],
};

/** The backend owns the final assignment and role decision; this gate prevents stale UI navigation. */
export async function openDriverNotification(
  accessToken: string | null,
  role: string | null,
  notification: CustomerNotification,
  onJob: (assignmentId: string) => void,
) {
  if (!accessToken || role !== 'driver') throw new Error('Sign in as a Driver to open this notification.');
  const payloadId = notification.data?.assignmentId;
  const assignmentId = typeof payloadId === 'string' ? payloadId.trim() : null;
  if (!assignmentId) throw new Error('This notification has no Driver assignment.');
  let job;
  try {job = await getDriverJob(accessToken, assignmentId);}
  catch {throw new Error('Assignment unavailable or no longer assigned to you.');}
  if (!ACTIVE.includes(job.assignmentStatus) || !RELEVANT[job.type].includes(job.orderStatus)) {
    throw new Error('This assignment is no longer active.');
  }
  if (!notification.is_read) {
    try {await markNotificationRead(accessToken, notification.id);}
    catch { /* The validated job remains available if read receipt fails. */ }
  }
  onJob(assignmentId);
}
