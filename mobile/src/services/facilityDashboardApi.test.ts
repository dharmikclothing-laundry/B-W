import {getFacilityDashboard} from './facilityDashboardApi';
import {apiRequest} from './api';

jest.mock('./api', () => ({apiRequest: jest.fn()}));

test('uses authenticated, self-scoped Facility dashboard endpoint', async () => {
  await getFacilityDashboard('staff-token');
  expect(apiRequest).toHaveBeenCalledWith('/facility/me/dashboard', {accessToken: 'staff-token'});
});
