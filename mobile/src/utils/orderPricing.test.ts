import {calculateCheckoutPricing} from './orderPricing';

describe('checkout pricing', () => {
  it('shows coupon discount and recomputes GST and total', () => {
    expect(calculateCheckoutPricing(400, 100)).toMatchObject({
      subtotal: 400, discountAmount: 100, pickupDeliveryCharge: 50,
      taxableAmount: 350, gstAmount: 17.5, grandTotal: 367.5,
    });
    expect(calculateCheckoutPricing(400).grandTotal).toBe(472.5);
    expect(calculateCheckoutPricing(400, 101)).toMatchObject({discountAmount: 101, grandTotal: 366.45});
  });
  it('uses the current server policy for the checkout estimate', () => {
    expect(calculateCheckoutPricing(400, 0, {pickupDeliveryFee: 75, freeDeliveryThreshold: 600, gstRatePercent: 12, minimumOrderAmount: 100}))
      .toMatchObject({pickupDeliveryCharge: 75, gstRate: 12, gstAmount: 57, grandTotal: 532, amountUntilFreeDelivery: 200});
  });
});
