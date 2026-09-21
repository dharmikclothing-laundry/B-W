import {apiRequest} from './api';
import {canCancelOrder, cancelOrder, newOrderAttemptKey} from './ordersApi';
import {getPaymentSummary, requestRefund} from './paymentsApi';

jest.mock('./api', () => ({apiRequest: jest.fn()}));
const request = apiRequest as jest.MockedFunction<typeof apiRequest>;

describe('customer cancellation and refunds', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows cancellation only in the backend transition states', () => {
    expect(canCancelOrder('confirmed')).toBe(true);
    expect(canCancelOrder('pickup_otp_pending')).toBe(true);
    expect(canCancelOrder('picked_up')).toBe(false);
    expect(canCancelOrder('cancelled')).toBe(false);
  });

  it('requires a reason and sends an eligible cancellation to the backend', async () => {
    await expect(cancelOrder('token', 'order-1', ' ')).rejects.toThrow('cancellation reason');
    expect(request).not.toHaveBeenCalled();
    request.mockResolvedValueOnce({orderStatus: 'cancelled'});
    await expect(cancelOrder('token', 'order-1', '  Changed plans  ')).resolves.toMatchObject({orderStatus: 'cancelled'});
    expect(request).toHaveBeenCalledWith('/orders/order-1/cancel', expect.objectContaining({body: {reason: 'Changed plans'}}));
  });

  it('preserves backend errors and reads customer refund status', async () => {
    request.mockRejectedValueOnce(new Error('Order cannot be cancelled'));
    await expect(cancelOrder('token', 'order-1', 'Changed plans')).rejects.toThrow('Order cannot be cancelled');
    request.mockResolvedValueOnce({orderId: 'order-1', payment: {status: 'paid'}, refunds: [{status: 'requested'}]});
    await expect(getPaymentSummary('token', 'order-1')).resolves.toMatchObject({refunds: [{status: 'requested'}]});
  });

  it('requests a refund through the existing customer endpoint only', async () => {
    await expect(requestRefund('token', 'payment-1', 0, 'reason')).rejects.toThrow('valid refund');
    request.mockResolvedValueOnce({status: 'requested'});
    await requestRefund('token', 'payment-1', 20, '  Wrong item  ');
    expect(request).toHaveBeenCalledWith('/payments/refunds/payment-1/request', expect.objectContaining({body: {amount: 20, reason: 'Wrong item'}}));
  });
});

describe('order retry key', () => {
  it('creates distinct UUID-shaped keys for separate checkout attempts', () => {
    const first = newOrderAttemptKey();
    const second = newOrderAttemptKey();
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(second).not.toBe(first);
  });
});
