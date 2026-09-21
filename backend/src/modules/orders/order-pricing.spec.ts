import {
  calculateOrderPricing,
} from './order-pricing';

describe('calculateOrderPricing', () => {
  it('adds ₹50 below the ₹500 threshold', () => {
    expect(
      calculateOrderPricing(400),
    ).toEqual({
      subtotal: 400,
      discountAmount: 0,
      pickupDeliveryCharge: 50,
      taxableAmount: 450,
      gstRate: 5,
      gstAmount: 22.5,
      totalAmount: 472.5,
    });
  });

  it('provides free pickup and delivery at exactly ₹500', () => {
    expect(
      calculateOrderPricing(500),
    ).toEqual({
      subtotal: 500,
      discountAmount: 0,
      pickupDeliveryCharge: 0,
      taxableAmount: 500,
      gstRate: 5,
      gstAmount: 25,
      totalAmount: 525,
    });
  });

  it('provides free pickup and delivery above ₹500', () => {
    expect(
      calculateOrderPricing(600),
    ).toEqual({
      subtotal: 600,
      discountAmount: 0,
      pickupDeliveryCharge: 0,
      taxableAmount: 600,
      gstRate: 5,
      gstAmount: 30,
      totalAmount: 630,
    });
  });

  it('rounds GST correctly to paise', () => {
    expect(
      calculateOrderPricing(499.99),
    ).toEqual({
      subtotal: 499.99,
      discountAmount: 0,
      pickupDeliveryCharge: 50,
      taxableAmount: 549.99,
      gstRate: 5,
      gstAmount: 27.5,
      totalAmount: 577.49,
    });
  });
  it('deducts a validated coupon before GST and caps it at subtotal', () => {
    expect(calculateOrderPricing(400, 100)).toMatchObject({
      discountAmount: 100, taxableAmount: 350, gstAmount: 17.5, totalAmount: 367.5,
    });
    expect(calculateOrderPricing(400, 1000).discountAmount).toBe(400);
    expect(() => calculateOrderPricing(400, -1)).toThrow();
  });
  it('uses the supplied versioned policy for future checkouts', () => {
    expect(calculateOrderPricing(400, 0, {pickupDeliveryFee: 75, freeDeliveryThreshold: 600, gstRatePercent: 12}))
      .toMatchObject({pickupDeliveryCharge: 75, gstRate: 12, gstAmount: 57, totalAmount: 532});
    expect(() => calculateOrderPricing(400, 0, {pickupDeliveryFee: -1, freeDeliveryThreshold: 600, gstRatePercent: 12})).toThrow();
  });
});
