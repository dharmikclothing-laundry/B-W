import {
  isRazorpayCancellation,
  openRazorpayCheckout,
  PaymentCheckoutCancelledError,
} from './razorpayCheckout';

jest.mock('react-native-razorpay', () => ({
  open: jest.fn(),
}));

describe('Razorpay checkout safety', () => {
  it.each([
    {description: 'Payment cancelled by user'},
    {error: {description: 'Checkout dismissed'}},
    {error: {code: 'BACK_PRESSED'}},
  ])('recognizes a checkout cancellation', (error) => {
    expect(isRazorpayCancellation(error)).toBe(true);
  });

  it('keeps a cancellation distinct from a failed payment', () => {
    expect(
      isRazorpayCancellation({description: 'Payment failed'}),
    ).toBe(false);
    expect(new PaymentCheckoutCancelledError().message).toContain(
      'awaiting payment',
    );
  });

  it('does not open Razorpay from a Development build', async () => {
    await expect(
      openRazorpayCheckout({
        keyId: 'rzp_test_unused',
        orderId: 'order_unused',
        amount: 1,
        currency: 'INR',
        orderNumber: 'BW-TEST',
      }),
    ).rejects.toThrow('disabled in Development');
  });
});
