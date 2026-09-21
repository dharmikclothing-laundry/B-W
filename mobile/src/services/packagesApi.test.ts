import {getMyPackages, getPackage, getPackages, purchasePackage} from './packagesApi';
import {apiRequest} from './api';
jest.mock('./api', () => ({apiRequest: jest.fn()}));
const request = apiRequest as jest.Mock;
test('reads available packages, details and customer balance from existing endpoints', async () => {
  request.mockResolvedValue([]);
  await getPackages('token'); await getPackage('token', 'pkg'); await getMyPackages('token');
  expect(request).toHaveBeenNthCalledWith(1, '/packages', {accessToken: 'token'});
  expect(request).toHaveBeenNthCalledWith(2, '/packages/pkg', {accessToken: 'token'});
  expect(request).toHaveBeenNthCalledWith(3, '/packages/me', {accessToken: 'token'});
});
test('purchase calls the authenticated subscription endpoint', async () => {
  request.mockResolvedValue({id: 'sub'});
  await expect(purchasePackage('token', 'pkg')).resolves.toEqual({id: 'sub'});
  expect(request).toHaveBeenCalledWith('/packages/pkg/subscribe', {method: 'POST', accessToken: 'token'});
});
