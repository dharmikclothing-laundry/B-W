export const FREE_PICKUP_DELIVERY_THRESHOLD = 500;
export const PICKUP_DELIVERY_CHARGE = 50;
export const GST_RATE_PERCENT = 5;
export type PricingPolicy = {pickupDeliveryFee: number; freeDeliveryThreshold: number; gstRatePercent: number};
export const DEFAULT_PRICING_POLICY: PricingPolicy = {
  pickupDeliveryFee: PICKUP_DELIVERY_CHARGE,
  freeDeliveryThreshold: FREE_PICKUP_DELIVERY_THRESHOLD,
  gstRatePercent: GST_RATE_PERCENT,
};

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export type OrderPricing = {
  subtotal: number;
  discountAmount: number;
  pickupDeliveryCharge: number;
  taxableAmount: number;
  gstRate: number;
  gstAmount: number;
  totalAmount: number;
};

export function calculateOrderPricing(
  subtotalInput: number,
  discountInput = 0,
  policy: PricingPolicy = DEFAULT_PRICING_POLICY,
): OrderPricing {
  const subtotal = roundMoney(subtotalInput);

  if (!Number.isFinite(subtotal) || subtotal < 0) {
    throw new Error('Invalid order subtotal');
  }
  if (!Number.isFinite(discountInput) || discountInput < 0) {
    throw new Error('Invalid order discount');
  }
  if (!Number.isFinite(policy.pickupDeliveryFee) || policy.pickupDeliveryFee < 0 ||
      !Number.isFinite(policy.freeDeliveryThreshold) || policy.freeDeliveryThreshold < 0 ||
      !Number.isFinite(policy.gstRatePercent) || policy.gstRatePercent < 0 || policy.gstRatePercent > 100) {
    throw new Error('Invalid pricing policy');
  }
  const discountAmount = roundMoney(Math.min(discountInput, subtotal));

  const pickupDeliveryCharge =
    subtotal < policy.freeDeliveryThreshold
      ? policy.pickupDeliveryFee
      : 0;

  const taxableAmount = roundMoney(
    subtotal - discountAmount + pickupDeliveryCharge,
  );

  const gstAmount = roundMoney(
    taxableAmount * (policy.gstRatePercent / 100),
  );

  const totalAmount = roundMoney(
    taxableAmount + gstAmount,
  );

  return {
    subtotal,
    discountAmount,
    pickupDeliveryCharge,
    taxableAmount,
    gstRate: policy.gstRatePercent,
    gstAmount,
    totalAmount,
  };
}
