import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import OrderReviewScreen from './OrderReviewScreen';
import {getActiveOffers, getLoyaltyInfo} from '../services/growthApi';
import {getMyPackages} from '../services/packagesApi';

jest.mock('../services/growthApi', () => ({getActiveOffers: jest.fn(), getLoyaltyInfo: jest.fn(), validateCoupon: jest.fn()}));
jest.mock('../services/packagesApi', () => ({getMyPackages: jest.fn()}));
const offers = getActiveOffers as jest.MockedFunction<typeof getActiveOffers>;
const loyalty = getLoyaltyInfo as jest.MockedFunction<typeof getLoyaltyInfo>;

describe('order review rewards summary', () => {
  it('shows combined coupon and points discount in the final estimate', async () => {
    offers.mockResolvedValue([]);
    loyalty.mockResolvedValue({balance: 1000, transactions: []});
    (getMyPackages as jest.Mock).mockResolvedValue([]);
    const view = await render(<OrderReviewScreen
      selectedAddress={null} pickupDateLabel="Tomorrow" pickupSlotLabel="Morning"
      cartItems={[]} cartSubtotal={400} accessToken="token"
      coupon={{offerId: 'offer-1', code: 'SAVE10', discount: 10}}
      onCouponChange={jest.fn()} loyaltyPoints={1000} onLoyaltyPointsChange={jest.fn()}
      selectedPackage={null} onPackageChange={jest.fn()}
      onBack={jest.fn()} onChangeAddress={jest.fn()} onChangePickupTime={jest.fn()}
      onContinueToPayment={jest.fn()}
    />);
    await waitFor(() => expect(view.getByLabelText('Applied loyalty points')).toBeTruthy());
    expect(view.getByText('Package, coupons & points discount')).toBeTruthy();
    expect(view.getByText('−₹20.00')).toBeTruthy();
    expect(view.getAllByText(/451.50/).length).toBeGreaterThan(0);
  });
  it('blocks continuing below the server minimum order amount', async () => {
    offers.mockResolvedValue([]); loyalty.mockResolvedValue({balance: 0, transactions: []});
    (getMyPackages as jest.Mock).mockResolvedValue([]);
    const onContinue = jest.fn();
    const view = await render(<OrderReviewScreen selectedAddress={null} pickupDateLabel="Tomorrow" pickupSlotLabel="Morning"
      cartItems={[]} cartSubtotal={400} pricingPolicy={{pickupDeliveryFee: 50, freeDeliveryThreshold: 500, gstRatePercent: 5, minimumOrderAmount: 450}}
      accessToken="token" coupon={null} onCouponChange={jest.fn()} loyaltyPoints={0} onLoyaltyPointsChange={jest.fn()}
      selectedPackage={null} onPackageChange={jest.fn()} onBack={jest.fn()} onChangeAddress={jest.fn()}
      onChangePickupTime={jest.fn()} onContinueToPayment={onContinue} />);
    await waitFor(() => expect(view.getByText('Minimum order ₹450.00.')).toBeTruthy());
    await fireEvent.press(view.getByText(/Continue to Payment/));
    expect(onContinue).not.toHaveBeenCalled();
  });
});
