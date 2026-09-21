import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import AdminGrowthScreen from './AdminGrowthScreen';
import {createAdminOffer, getAdminGrowth, setAdminGrowthSettings, setAdminOfferActive, setAdminPackageActive} from '../services/adminGrowthApi';
jest.mock('../services/adminGrowthApi', () => ({getAdminGrowth: jest.fn(), createAdminOffer: jest.fn(), updateAdminOffer: jest.fn(), setAdminOfferActive: jest.fn(),
  createAdminPackage: jest.fn(), updateAdminPackage: jest.fn(), setAdminPackageActive: jest.fn(), setAdminPackageEligibility: jest.fn(), setAdminGrowthSettings: jest.fn()}));
const overview = {offers: [{id: 'o1', coupon_code: 'SAVE10', name: 'Sale', discount_type: 'fixed', discount_value: 10,
  minimum_order_amount: 100, maximum_discount: null, starts_at: null, expires_at: null, usage_limit: 2, is_active: true,
  eligibility_note: null, redeemedCount: 1, termsLocked: true}], redemptions: [],
  packages: [{id: 'p1', name: 'Fictional pack', description: '', price: 100, validity_days: 30, is_active: true, soldCount: 1, termsLocked: true}],
  subscriptions: [], eligibility: [], services: [], settings: {referral_enabled: true, referral_reward_points: 0,
    loyalty_earn_points_per_rupee: 0.01, loyalty_points_per_rupee: 100, loyalty_minimum_redemption_rupees: 10},
  referrals: [], loyaltyHistory: [], audit: []};
beforeEach(() => {jest.clearAllMocks(); (getAdminGrowth as jest.Mock).mockResolvedValue(overview);
  (createAdminOffer as jest.Mock).mockResolvedValue({}); (setAdminGrowthSettings as jest.Mock).mockResolvedValue({});
  (setAdminOfferActive as jest.Mock).mockResolvedValue({}); (setAdminPackageActive as jest.Mock).mockResolvedValue({});});
test('shows locked sold/redeemed terms and permits availability changes with refresh', async () => {
  const view = await render(<AdminGrowthScreen accessToken="token" onBack={jest.fn()} />);
  await waitFor(() => expect(view.getByText('Redeemed terms locked; activation remains available.')).toBeTruthy());
  expect(view.getByText('Sold contract locked; activation remains available.')).toBeTruthy();
  expect(view.queryByText('Edit offer')).toBeNull();
  expect(view.queryByText('Edit package')).toBeNull();
  await fireEvent.press(view.getByText('Deactivate offer'));
  await waitFor(() => expect(setAdminOfferActive).toHaveBeenCalledWith('token', 'o1', false));
  await waitFor(() => expect(getAdminGrowth).toHaveBeenCalledTimes(2));
});
test('creates inactive offer terms and edits Admin growth rules', async () => {
  const view = await render(<AdminGrowthScreen accessToken="token" onBack={jest.fn()} />);
  await waitFor(() => expect(view.getByText('Save offer')).toBeTruthy());
  await fireEvent.changeText(view.getByLabelText('Coupon code'), 'LOCAL9G');
  await fireEvent.changeText(view.getByLabelText('Offer name'), 'Local offer');
  await fireEvent.changeText(view.getByLabelText('Discount value'), '10');
  await fireEvent.press(view.getByText('Save offer'));
  await waitFor(() => expect(createAdminOffer).toHaveBeenCalledWith('token', expect.objectContaining({couponCode: 'LOCAL9G', discountValue: 10})));
  await fireEvent.press(view.getByText('Referrals: Enabled (tap to change)'));
  await fireEvent.press(view.getByText('Save growth rules'));
  await waitFor(() => expect(setAdminGrowthSettings).toHaveBeenCalledWith('token', expect.objectContaining({referralEnabled: false, loyaltyPointsPerRupee: 100})));
});
test('shows network error and retry', async () => {
  (getAdminGrowth as jest.Mock).mockRejectedValueOnce(new Error('Network unavailable'));
  const view = await render(<AdminGrowthScreen accessToken="token" onBack={jest.fn()} />);
  await waitFor(() => expect(view.getByText('Network unavailable')).toBeTruthy());
  await fireEvent.press(view.getByText('Retry growth programs'));
  await waitFor(() => expect(view.getByText('Growth programs')).toBeTruthy());
});
