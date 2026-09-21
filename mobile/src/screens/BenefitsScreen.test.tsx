import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import BenefitsScreen from './BenefitsScreen';
import {getActiveOffers, getLoyaltyInfo, getReferralInfo} from '../services/growthApi';

jest.mock('../services/growthApi', () => ({getActiveOffers: jest.fn(), getLoyaltyInfo: jest.fn(), getReferralInfo: jest.fn()}));
const loyalty = getLoyaltyInfo as jest.MockedFunction<typeof getLoyaltyInfo>;
const referral = getReferralInfo as jest.MockedFunction<typeof getReferralInfo>;

describe('customer benefits', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getActiveOffers as jest.Mock).mockResolvedValue([]);
    referral.mockResolvedValue({code: 'BW123', history: [{id: 'r1', status: 'rewarded', created_at: '2026-09-01'}]});
    loyalty.mockResolvedValue({balance: 200, transactions: [{id: 't1', points: 200, transaction_type: 'earned', created_at: '2026-09-01'}]});
  });
  it('shows referral code and reward and loyalty histories', async () => {
    const view = await render(<BenefitsScreen accessToken="token" onBack={jest.fn()} />);
    await waitFor(() => expect(view.getByText('BW123')).toBeTruthy());
    expect(view.getByText(/rewarded/)).toBeTruthy();
    expect(view.getByLabelText('Loyalty balance')).toBeTruthy();
    expect(view.getByText(/\+200 · earned/)).toBeTruthy();
  });
  it('directs redemption to checkout without deducting points', async () => {
    const view = await render(<BenefitsScreen accessToken="token" onBack={jest.fn()} />);
    await waitFor(() => expect(view.getByText('BW123')).toBeTruthy());
    expect(view.getByText('10 points = ₹1. Redeem at least 1,000 points (₹100) during checkout.')).toBeTruthy();
    expect(view.getByText('Earn 1 point per ₹100 paid after delivery.')).toBeTruthy();
  });
});

test('offers are loaded from the server and show coupon and limits', async () => {
  (getActiveOffers as jest.Mock).mockResolvedValue([{id: 'offer', name: 'Laundry savings', coupon_code: 'SAVE10', discount_type: 'percentage', discount_value: 10, minimum_order_amount: 100, maximum_discount: 50}]);
  const view = await render(<BenefitsScreen accessToken="token" onBack={jest.fn()} />);
  await waitFor(() => expect(view.getByText('Code: SAVE10')).toBeTruthy());
  expect(view.getByText('10% off on orders from ₹100.00 · Save up to ₹50.00')).toBeTruthy();
});
test('offers retry independently without hiding loaded loyalty information', async () => {
  (getActiveOffers as jest.Mock).mockRejectedValueOnce(new Error('Offers offline')).mockResolvedValueOnce([]);
  const view = await render(<BenefitsScreen accessToken="token" onBack={jest.fn()} />);
  await waitFor(() => expect(view.getByText('Offers offline')).toBeTruthy());
  expect(view.getByLabelText('Loyalty balance')).toBeTruthy();
  await fireEvent.press(view.getByText('Retry offers'));
  await waitFor(() => expect(view.getByText('No offers are available right now.')).toBeTruthy());
});
