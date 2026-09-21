import {apiRequest} from './api';

export type FacilityDashboard = {
  facility: {id: string; name: string; address: string | null};
  role: 'manager' | 'facility_employee';
  summary: {incoming: number; received: number; processing: number; ready: number};
  orders: Array<{id: string; order_number: string; current_status: string; created_at: string; updated_at: string}>;
};

export function getFacilityDashboard(accessToken: string) {
  return apiRequest<FacilityDashboard>('/facility/me/dashboard', {accessToken});
}
