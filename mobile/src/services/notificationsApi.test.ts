import {apiRequest} from './api';
import {getNotifications, notificationOrderId} from './notificationsApi';

jest.mock('./api', () => ({apiRequest: jest.fn()}));
const mockedApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;

describe('customer notifications', () => {
  it('keeps order deep-links only for valid notification payloads', () => {
    expect(notificationOrderId({data: {orderId: 'order-1'}} as any)).toBe('order-1');
    expect(notificationOrderId({data: {}} as any)).toBeNull();
  });

  it('turns a malformed inbox response into the loading error state', async () => {
    mockedApiRequest.mockResolvedValueOnce({} as any);
    await expect(getNotifications('token')).rejects.toThrow('Unable to load notifications');
  });
});
