import {
  confirmFacilityPacking,
  getFacilityPacking,
} from './facilityPackingApi';
import { apiRequest } from './api';
jest.mock('./api', () => ({ apiRequest: jest.fn() }));
test('uses scoped packing preview and atomic confirmation contracts', async () => {
  await getFacilityPacking('token', 'order-1');
  await confirmFacilityPacking(
    'token',
    'order-1',
    [{ orderItemId: 'item-1', packedQuantity: 2 }],
    'Packed clean',
  );
  expect(apiRequest).toHaveBeenNthCalledWith(
    1,
    '/facility/orders/order-1/packing',
    { accessToken: 'token' },
  );
  expect(apiRequest).toHaveBeenNthCalledWith(
    2,
    '/facility/orders/order-1/packing',
    {
      accessToken: 'token',
      method: 'POST',
      body: {
        items: [{ orderItemId: 'item-1', packedQuantity: 2 }],
        notes: 'Packed clean',
      },
    },
  );
});
