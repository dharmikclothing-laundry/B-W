import {apiRequest} from './api';

export type Offer = {
  id: string;
  name: string;
  coupon_code: string | null;
  discount_type: 'percentage' | 'fixed';
  discount_value: number | string;
  minimum_order_amount: number | string;
  maximum_discount: number | string | null;
};
export type CouponResult = {offerId: string; code: string; discount: number};
export type ReferralInfo = {
  code: string;
  history: Array<{id: string; status: string; reward_status?: string; created_at: string}>;
};
export type LoyaltyTransaction = {
  id: string; points: number; transaction_type: string; reason?: string; created_at: string;
};
export type GrowthRules = {loyalty_points_per_rupee: number | string; loyalty_minimum_redemption_rupees: number | string;
  loyalty_earn_points_per_rupee: number | string; referral_enabled: boolean; referral_reward_points: number};
export type LoyaltyInfo = {balance: number; transactions: LoyaltyTransaction[]; rules?: GrowthRules};

export const getActiveOffers = (token: string) =>
  apiRequest<Offer[]>('/growth/offers', {accessToken: token});
export const validateCoupon = (token: string, code: string, orderAmount: number) =>
  apiRequest<CouponResult>('/growth/coupon', {
    method: 'POST', accessToken: token, body: {code: code.trim(), orderAmount},
  });
export const getReferralInfo = (token: string) =>
  apiRequest<ReferralInfo>('/growth/referral', {accessToken: token});
export const getLoyaltyInfo = (token: string) =>
  apiRequest<LoyaltyInfo>('/growth/loyalty', {accessToken: token});
