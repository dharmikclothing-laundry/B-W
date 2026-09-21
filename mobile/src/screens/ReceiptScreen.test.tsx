import React from 'react';
import {render, waitFor} from '@testing-library/react-native';
import ReceiptScreen from './ReceiptScreen';
import {getOrder} from '../services/ordersApi';
import {getPaymentSummary} from '../services/paymentsApi';
jest.mock('../services/ordersApi', () => ({getOrder: jest.fn()}));
jest.mock('../services/paymentsApi', () => ({getPaymentSummary: jest.fn()}));
const order = {id: 'order-1', order_number: 'BW-123', created_at: '2026-09-18T10:00:00Z', order_items: [], subtotal: 100, discount_amount: 10, pickup_delivery_charge: 50, taxable_amount: 140, gst_rate: 5, gst_amount: 7, total_amount: 147, payment_method: 'cash_on_delivery'};
test('historical receipt shows server GST and pricing without claiming a tax invoice', async () => {
  (getOrder as jest.Mock).mockResolvedValue(order);
  (getPaymentSummary as jest.Mock).mockResolvedValue({payment: null, refunds: []});
  const view = await render(<ReceiptScreen accessToken="token" orderId="order-1" onBack={jest.fn()} />);
  await waitFor(() => expect(view.getByText('Order BW-123')).toBeTruthy());
  expect(view.getByText('GST (5%): ₹7.00')).toBeTruthy();
  expect(view.getByText('Total: ₹147.00')).toBeTruthy();
  expect(view.getByText(/A tax invoice is not available/)).toBeTruthy();
});
test('historical receipt remains visible if payment lookup fails', async () => {
  (getOrder as jest.Mock).mockResolvedValue(order);
  (getPaymentSummary as jest.Mock).mockRejectedValue(new Error('offline'));
  const view = await render(<ReceiptScreen accessToken="token" orderId="order-1" onBack={jest.fn()} />);
  await waitFor(() => expect(view.getByText('Order BW-123')).toBeTruthy());
});

test('receipt tolerates an absent historical payment method', async () => {
  (getOrder as jest.Mock).mockResolvedValue({...order, payment_method: null});
  (getPaymentSummary as jest.Mock).mockResolvedValue({payment: {status: 'partially_refunded'}, refunds: [{refundRequestId: 'r1', amount: 1, status: 'completed'}]});
  const view = await render(<ReceiptScreen accessToken="token" orderId="order-1" onBack={jest.fn()} />);
  await waitFor(() => expect(view.getByText('Payment method: Not recorded')).toBeTruthy());
  expect(view.getByText('Payment status: Partially refunded')).toBeTruthy();
  expect(view.getByText('Refund ₹1.00 · Completed')).toBeTruthy();
});
