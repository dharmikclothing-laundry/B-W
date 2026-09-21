import {apiRequest} from './api';
import {getAdminCatalogue, setAdminPricingPolicy, setAdminServicePrice, updateAdminService} from './adminCatalogueApi';
jest.mock('./api', () => ({apiRequest: jest.fn()}));
const request = apiRequest as jest.Mock;
beforeEach(() => request.mockReset());
test('reads catalogue and writes prices only through Admin routes', () => {
  getAdminCatalogue('token'); setAdminServicePrice('token', 'service', 45, 'facility'); updateAdminService('token', 'service', {isActive: false});
  expect(request).toHaveBeenCalledWith('/admin/catalogue', {accessToken: 'token'});
  expect(request).toHaveBeenCalledWith('/admin/catalogue/services/service/prices', {accessToken: 'token', method: 'POST', body: {price: 45, facilityId: 'facility'}});
  expect(request).toHaveBeenCalledWith('/admin/catalogue/services/service', {accessToken: 'token', method: 'PATCH', body: {isActive: false}});
});
test('rejects invalid pricing before sending', async () => {
  await expect(setAdminServicePrice('token', 'service', -1)).rejects.toThrow('nonnegative');
  await expect(setAdminPricingPolicy('token', {pickupDeliveryFee: 1, freeDeliveryThreshold: 2, gstRatePercent: 101, minimumOrderAmount: 0})).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});
