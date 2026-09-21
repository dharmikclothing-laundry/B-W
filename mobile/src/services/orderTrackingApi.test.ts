import {apiRequest} from './api';
import {
  canCustomerTrackOrder,
  getOrderTracking,
  hasLiveDriverLocation,
} from './orderTrackingApi';

jest.mock('./api', () => ({apiRequest: jest.fn()}));

const mockedApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;

describe('customer order tracking', () => {
  it('shows an assignment only during trackable pickup and delivery states', () => {
    expect(canCustomerTrackOrder('pickup_assigned')).toBe(true);
    expect(canCustomerTrackOrder('delivery_assigned')).toBe(true);
    expect(canCustomerTrackOrder('completed')).toBe(false);
    expect(canCustomerTrackOrder('cancelled')).toBe(false);
  });

  it('shows live location only while the driver is en route or at handover', () => {
    expect(hasLiveDriverLocation('en_route_pickup')).toBe(true);
    expect(hasLiveDriverLocation('delivery_otp_pending')).toBe(true);
    expect(hasLiveDriverLocation('pickup_assigned')).toBe(false);
  });

  it('returns a tracking response and rejects an invalid response for the error state', async () => {
    mockedApiRequest.mockResolvedValueOnce({
      orderId: 'order-1', orderStatus: 'en_route_pickup', assignment: null,
      location: null, distanceMeters: null, etaMinutes: null,
    });
    await expect(getOrderTracking('token', 'order-1')).resolves.toMatchObject({
      orderStatus: 'en_route_pickup',
    });

    mockedApiRequest.mockResolvedValueOnce({orderId: 'other-order'} as any);
    await expect(getOrderTracking('token', 'order-1')).rejects.toThrow(
      'Unable to load order tracking',
    );
  });
});
