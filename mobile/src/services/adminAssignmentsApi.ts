import {apiRequest} from './api';

export type AdminAssignment = {id: string; order_id?: string; driver_id: string; assignment_type: 'pickup' | 'delivery'; status: string; assigned_at: string; accepted_at: string | null; completed_at: string | null; rejection_reason: string | null};
export type AdminJob = {orderId: string; orderNumber: string; orderStatus: string; type: 'pickup' | 'delivery'; assignment: AdminAssignment | null; lastAssignment: AdminAssignment | null; canAssign: boolean; stale: boolean};
export type AdminDriver = {id: string; name: string; isActive: boolean; isAvailable: boolean; maxConcurrentJobs: number; activeJobs: number};
export type AdminAssignmentOverview = {jobs: AdminJob[]; drivers: AdminDriver[]; staleAfterMinutes: number};
export type AdminAssignmentDetail = {order: {id: string; order_number: string; current_status: string}; assignments: AdminAssignment[]; audit: Array<{id: string; action: string; created_at: string; actor_profile_id: string}>; tracking: {recordedAt: string; stale: boolean} | null};

export const listAdminAssignments = (token: string) => apiRequest<AdminAssignmentOverview>('/admin/assignments', {accessToken: token});
export const getAdminAssignmentDetail = (token: string, orderId: string) =>
  apiRequest<AdminAssignmentDetail>(`/admin/assignments/orders/${encodeURIComponent(orderId)}`, {accessToken: token});
export function assignAdminDriver(token: string, orderId: string, driverId: string, type: 'pickup' | 'delivery') {
  if (!driverId) return Promise.reject(new Error('Choose an available Driver.'));
  return apiRequest(`/admin/assignments/orders/${encodeURIComponent(orderId)}/assign`, {accessToken: token, method: 'POST', body: {driverId, type}});
}
export function reassignAdminDriver(token: string, assignmentId: string, driverId: string) {
  if (!driverId) return Promise.reject(new Error('Choose a replacement Driver.'));
  return apiRequest(`/admin/assignments/${encodeURIComponent(assignmentId)}/reassign`, {accessToken: token, method: 'POST', body: {driverId}});
}
