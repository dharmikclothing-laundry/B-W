import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import LoyaltySection from './LoyaltySection';
import {getLoyaltyInfo} from '../services/growthApi';

jest.mock('../services/growthApi', () => ({getLoyaltyInfo: jest.fn()}));
const loyalty = getLoyaltyInfo as jest.MockedFunction<typeof getLoyaltyInfo>;

describe('checkout loyalty redemption', () => {
  beforeEach(() => {jest.clearAllMocks(); loyalty.mockResolvedValue({balance: 2500, transactions: []});});
  it('validates balance and service total before applying points', async () => {
    const change = jest.fn();
    const view = await render(<LoyaltySection accessToken="token" subtotalAfterCoupon={200} points={0} onChange={change} />);
    await waitFor(() => expect(view.getByText('Available: 2500 points · 10 points = ₹1 · Minimum 1,000 points (₹100)')).toBeTruthy());
    await fireEvent.changeText(view.getByLabelText('Points to use'), '3000');
    await fireEvent.press(view.getByText('Apply'));
    expect(view.getByText('Insufficient loyalty points.')).toBeTruthy();
    await fireEvent.changeText(view.getByLabelText('Points to use'), '2250');
    await fireEvent.press(view.getByText('Apply'));
    expect(view.getByText('Points exceed the remaining service price.')).toBeTruthy();
    await fireEvent.changeText(view.getByLabelText('Points to use'), '999');
    await fireEvent.press(view.getByText('Apply'));
    expect(view.getByText('Redeem at least 1,000 points (₹100).')).toBeTruthy();
    await fireEvent.changeText(view.getByLabelText('Points to use'), '1000');
    await fireEvent.press(view.getByText('Apply'));
    expect(change).toHaveBeenCalledWith(1000);
    await view.rerender(<LoyaltySection accessToken="token" subtotalAfterCoupon={200} points={1000} onChange={change} />);
    await fireEvent.press(view.getByText('Remove points'));
    expect(change).toHaveBeenCalledWith(0);
  });
  it('uses Admin-configured redemption rate and minimum from the server', async () => {
    loyalty.mockResolvedValueOnce({balance: 3000, transactions: [], rules: {
      loyalty_points_per_rupee: 200, loyalty_minimum_redemption_rupees: 5,
      loyalty_earn_points_per_rupee: 0.01, referral_enabled: true, referral_reward_points: 0,
    }});
    const change = jest.fn(); const onRateChange = jest.fn();
    const view = await render(<LoyaltySection accessToken="token" subtotalAfterCoupon={20} points={0} onChange={change} onRateChange={onRateChange} />);
    await waitFor(() => expect(view.getByText('Available: 3000 points · 200 points = ₹1 · Minimum 1,000 points (₹5)')).toBeTruthy());
    expect(onRateChange).toHaveBeenCalledWith(200);
    await fireEvent.changeText(view.getByLabelText('Points to use'), '1000');
    await fireEvent.press(view.getByText('Apply'));
    expect(change).toHaveBeenCalledWith(1000);
  });
});
