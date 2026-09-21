import {getFacilityIntake, verifyFacilityIntake, resolveFacilityDiscrepancy} from './facilityVerificationApi';
import {apiRequest} from './api';
jest.mock('./api', () => ({apiRequest: jest.fn()}));

test('Facility verification reads scoped intake, writes measurements, and resolves through Manager route', async () => {
  const items = [{orderItemId: 'item-1', countedQuantity: 2, weightKg: 1.5, notes: ''}];
  await getFacilityIntake('token', 'order-1');
  await verifyFacilityIntake('token', 'order-1', items, 'checked');
  await resolveFacilityDiscrepancy('token', 'order-1', 'disc-1', 'reconciled');
  expect(apiRequest).toHaveBeenNthCalledWith(1, '/facility/orders/order-1/intake', {accessToken: 'token'});
  expect(apiRequest).toHaveBeenNthCalledWith(2, '/facility/orders/order-1/intake-verify',
    {accessToken: 'token', method: 'POST', body: {items, notes: 'checked'}});
  expect(apiRequest).toHaveBeenNthCalledWith(3, '/facility/orders/order-1/intake-discrepancies/disc-1/resolve',
    {accessToken: 'token', method: 'PATCH', body: {notes: 'reconciled'}});
});
