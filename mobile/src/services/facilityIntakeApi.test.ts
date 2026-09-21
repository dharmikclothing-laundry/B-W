import {confirmFacilityReceipt, previewFacilityReceipt} from './facilityIntakeApi';
import {apiRequest} from './api';
jest.mock('./api', () => ({apiRequest: jest.fn()}));
test('uses existing Facility preview and atomic receipt routes', async () => {
  await previewFacilityReceipt('token', 'BW1:code');
  await confirmFacilityReceipt('token', 'BW1:code');
  expect(apiRequest).toHaveBeenNthCalledWith(1, '/facility/receive/preview', {accessToken: 'token', method: 'POST', body: {token: 'BW1:code'}});
  expect(apiRequest).toHaveBeenNthCalledWith(2, '/facility/receive/qr', {accessToken: 'token', method: 'POST', body: {token: 'BW1:code'}});
});
