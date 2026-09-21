import {apiRequest} from './api';
import {assignAdminDriver, getAdminAssignmentDetail, listAdminAssignments, reassignAdminDriver} from './adminAssignmentsApi';
jest.mock('./api', () => ({apiRequest: jest.fn()}));
const request = apiRequest as jest.Mock;
beforeEach(() => request.mockReset());
test('lists Admin jobs and history with authenticated routes', () => {
  listAdminAssignments('token'); getAdminAssignmentDetail('token', 'order');
  expect(request).toHaveBeenCalledWith('/admin/assignments', {accessToken: 'token'});
  expect(request).toHaveBeenCalledWith('/admin/assignments/orders/order', {accessToken: 'token'});
});
test('assigns and reassigns through Admin atomic API routes', () => {
  assignAdminDriver('token', 'order', 'driver', 'pickup'); reassignAdminDriver('token', 'old', 'replacement');
  expect(request).toHaveBeenCalledWith('/admin/assignments/orders/order/assign', {accessToken: 'token', method: 'POST', body: {driverId: 'driver', type: 'pickup'}});
  expect(request).toHaveBeenCalledWith('/admin/assignments/old/reassign', {accessToken: 'token', method: 'POST', body: {driverId: 'replacement'}});
});
test('requires a Driver selection', async () => {
  await expect(assignAdminDriver('token', 'order', '', 'pickup')).rejects.toThrow('Choose');
  await expect(reassignAdminDriver('token', 'old', '')).rejects.toThrow('Choose');
  expect(request).not.toHaveBeenCalled();
});
