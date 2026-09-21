import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import OrderCareSection from './OrderCareSection';
import {cancelOrder} from '../services/ordersApi';
import {chooseClaimPhoto, createClaim, getOrderClaims, uploadClaimPhoto} from '../services/claimsApi';
import {getPaymentSummary, requestRefund} from '../services/paymentsApi';
import type {CustomerOrder} from '../types/order';

jest.mock('../services/ordersApi', () => ({
  canCancelOrder: (status: string) => status === 'confirmed',
  cancelOrder: jest.fn(),
}));
jest.mock('../services/claimsApi', () => ({
  canRaiseClaim: (status: string, deadline: string) => status === 'claim_period_active' && Date.parse(deadline) > Date.now(),
  CLAIM_TYPES: [{value: 'damage', label: 'Damaged'}, {value: 'missing_item', label: 'Missing item'}],
  chooseClaimPhoto: jest.fn(), createClaim: jest.fn(), getOrderClaims: jest.fn(), uploadClaimPhoto: jest.fn(),
}));
jest.mock('../services/paymentsApi', () => ({getPaymentSummary: jest.fn(), requestRefund: jest.fn()}));

const cancel = cancelOrder as jest.MockedFunction<typeof cancelOrder>;
const create = createClaim as jest.MockedFunction<typeof createClaim>;
const photo = chooseClaimPhoto as jest.MockedFunction<typeof chooseClaimPhoto>;
const upload = uploadClaimPhoto as jest.MockedFunction<typeof uploadClaimPhoto>;
const claims = getOrderClaims as jest.MockedFunction<typeof getOrderClaims>;
const payment = getPaymentSummary as jest.MockedFunction<typeof getPaymentSummary>;
const refund = requestRefund as jest.MockedFunction<typeof requestRefund>;
const baseOrder = {id: 'order-1', current_status: 'confirmed', claim_deadline_at: null} as CustomerOrder;

function screen(order = baseOrder, onActionComplete = jest.fn().mockResolvedValue(undefined)) {
  return render(<OrderCareSection accessToken="token" order={order} refreshKey={0} onActionComplete={onActionComplete} />);
}

describe('OrderCareSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    claims.mockResolvedValue([]);
    payment.mockResolvedValue({orderId: 'order-1', payment: null, refunds: []});
  });

  it('shows cancellation only when eligible and refreshes after success', async () => {
    cancel.mockResolvedValueOnce({orderStatus: 'cancelled'});
    const refresh = jest.fn().mockResolvedValue(undefined);
    const view = await screen(baseOrder, refresh);
    await waitFor(() => expect(view.getByText('No claims for this order.')).toBeTruthy());
    await fireEvent.press(view.getAllByText('Cancel Order')[1]);
    await waitFor(() => expect(view.getByLabelText('Cancellation reason')).toBeTruthy());
    await fireEvent.changeText(view.getByLabelText('Cancellation reason'), 'Changed plans');
    await fireEvent.press(view.getByText('Confirm cancellation'));
    await waitFor(() => expect(cancel).toHaveBeenCalledWith('token', 'order-1', 'Changed plans'));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(view.getByText('Order cancelled.')).toBeTruthy();
    await view.rerender(<OrderCareSection accessToken="token" order={{...baseOrder, current_status: 'picked_up'}} refreshKey={1} onActionComplete={refresh} />);
    expect(view.queryByText('Confirm cancellation')).toBeNull();
  });

  it('shows backend cancellation errors without claiming success', async () => {
    cancel.mockRejectedValueOnce(new Error('Order cannot be cancelled'));
    const view = await screen();
    await waitFor(() => expect(view.getByText('No claims for this order.')).toBeTruthy());
    await fireEvent.press(view.getAllByText('Cancel Order')[1]);
    await waitFor(() => expect(view.getByLabelText('Cancellation reason')).toBeTruthy());
    await fireEvent.changeText(view.getByLabelText('Cancellation reason'), 'Changed plans');
    await fireEvent.press(view.getByText('Confirm cancellation'));
    await waitFor(() => expect(view.getByText('Order cannot be cancelled')).toBeTruthy());
    expect(view.queryByText('Order cancelled.')).toBeNull();
  });

  it('creates a claim with a selected photograph and shows claim status', async () => {
    const order = {...baseOrder, current_status: 'claim_period_active', claim_deadline_at: new Date(Date.now() + 60000).toISOString()};
    claims.mockResolvedValue([{id: 'existing', claim_type: 'damage', status: 'under_review', description: 'Garment damaged', created_at: new Date().toISOString(), customer_claim_photos: []}]);
    photo.mockResolvedValueOnce({uri: 'file:///photo.jpg', name: 'photo.jpg', type: 'image/jpeg'});
    create.mockResolvedValueOnce({id: 'claim-2'} as any);
    upload.mockResolvedValueOnce({} as any);
    const refresh = jest.fn().mockResolvedValue(undefined);
    const view = await screen(order, refresh);
    await waitFor(() => expect(view.getByText('Damage · Under review')).toBeTruthy());
    await fireEvent.press(view.getByText('Raise Claim'));
    await waitFor(() => expect(view.getByText('Missing item')).toBeTruthy());
    await fireEvent.press(view.getByText('Missing item'));
    await fireEvent.changeText(view.getByLabelText('Claim description'), 'My shirt is missing');
    await fireEvent.press(view.getByText('Choose claim photo (optional)'));
    await waitFor(() => expect(view.getByText('Photo: photo.jpg')).toBeTruthy());
    await fireEvent.press(view.getByText('Submit Claim'));
    await waitFor(() => expect(create).toHaveBeenCalledWith('token', 'order-1', 'missing_item', 'My shirt is missing'));
    await waitFor(() => expect(upload).toHaveBeenCalled());
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('explains when iOS camera capture returns no photo', async () => {
    claims.mockResolvedValue([{id: 'existing', claim_type: 'damage', status: 'submitted', description: 'Test claim', created_at: new Date().toISOString(), customer_claim_photos: []}]);
    photo.mockResolvedValueOnce(null);
    const view = await screen();
    await waitFor(() => expect(view.getByText('Take claim photo')).toBeTruthy());
    await fireEvent.press(view.getByText('Take claim photo'));
    await waitFor(() => expect(view.getByText('Camera did not return a photo. Tap Use Photo after taking the picture.')).toBeTruthy());
    expect(upload).not.toHaveBeenCalled();
  });

  it('renders refund status and refreshes after a customer request', async () => {
    payment.mockResolvedValue({orderId: 'order-1', payment: {paymentOrderId: 'payment-1', status: 'paid', amount: 10000, currency: 'INR'}, refunds: [{refundRequestId: 'refund-1', amount: 25, reason: 'Damage', status: 'requested', cancellation: false}]});
    refund.mockResolvedValueOnce({} as any);
    const refresh = jest.fn().mockResolvedValue(undefined);
    const view = await screen(baseOrder, refresh);
    await waitFor(() => expect(view.getByText('Refund: Requested · ₹25.00')).toBeTruthy());
    await fireEvent.press(view.getByText('Request Refund'));
    await waitFor(() => expect(view.getByLabelText('Refund amount')).toBeTruthy());
    await fireEvent.changeText(view.getByLabelText('Refund amount'), '20');
    await fireEvent.changeText(view.getByLabelText('Refund reason'), 'Wrong item');
    await fireEvent.press(view.getByText('Submit Refund Request'));
    await waitFor(() => expect(refund).toHaveBeenCalledWith('token', 'payment-1', 20, 'Wrong item'));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('keeps partial data visible when one customer endpoint fails and supports retry', async () => {
    claims.mockRejectedValueOnce(new Error('Offline'));
    const view = await screen();
    await waitFor(() => expect(view.getByText('Claims: Offline')).toBeTruthy());
    expect(view.getByText('No online payment for this order.')).toBeTruthy();
    await fireEvent.press(view.getByText('Retry order help'));
    await waitFor(() => expect(view.getByText('No claims for this order.')).toBeTruthy());
  });
});
