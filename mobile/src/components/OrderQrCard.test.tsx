import React from 'react';
import {render, waitFor} from '@testing-library/react-native';
import OrderQrCard from './OrderQrCard';
import {getCustomerOrderQr} from '../services/qrApi';
jest.mock('../services/qrApi', () => ({getCustomerOrderQr: jest.fn()}));
jest.mock('qrcode', () => ({__esModule: true, default: {create: () => ({modules: {size: 2, get: (row: number, col: number) => row === col}})}}));
test('renders the customer-owned order QR without operational scan controls', async () => {(getCustomerOrderQr as jest.Mock).mockResolvedValue({orderId: 'order-1', token: 'secure', payload: 'BW1:secure'}); const view = await render(<OrderQrCard accessToken="token" orderId="order-1" />); await waitFor(() => expect(view.getByLabelText('Order handoff QR code')).toBeTruthy()); expect(getCustomerOrderQr).toHaveBeenCalledWith('token', 'order-1'); expect(view.queryByText(/scan order/i)).toBeNull(); expect(view.getByText(/restricted to authorized staff/)).toBeTruthy();});
