import {accountRoleFromProfile, getDriverProfile, updateDriverName} from './driverProfileApi';
import {apiRequest} from './api';

jest.mock('./api', () => ({apiRequest: jest.fn()}));
const request = apiRequest as jest.Mock;

test('routes Driver and Facility identities without changing customer role detection', () => {
  expect(accountRoleFromProfile({accountRole: 'driver'})).toBe('driver');
  expect(accountRoleFromProfile({profile: {accountRole: 'admin'}})).toBe('admin');
  expect(accountRoleFromProfile({roles: [{roles: {code: 'facility_employee'}}]})).toBe('facility_employee');
  expect(accountRoleFromProfile({profile: {accountRole: 'customer'}})).toBe('customer');
});

test('Driver profile uses the existing authenticated API client', async () => {
  request.mockResolvedValue({id: 'driver'});
  await getDriverProfile('token');
  await updateDriverName('token', ' Development Driver ');
  expect(request).toHaveBeenNthCalledWith(1, '/drivers/me/profile', {accessToken: 'token'});
  expect(request).toHaveBeenNthCalledWith(2, '/drivers/me/profile', {
    accessToken: 'token', method: 'PATCH', body: {fullName: 'Development Driver'},
  });
});

test('rejects an invalid Driver name before sending a request', () => {
  request.mockClear();
  expect(() => updateDriverName('token', ' ')).toThrow();
  expect(request).not.toHaveBeenCalled();
});
