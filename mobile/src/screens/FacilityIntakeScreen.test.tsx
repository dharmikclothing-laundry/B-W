import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import FacilityIntakeScreen from './FacilityIntakeScreen';
import {
  confirmFacilityReceipt,
  confirmFacilityReceiptByOrderId,
  previewFacilityReceipt,
  previewFacilityReceiptByOrderId,
} from '../services/facilityIntakeApi';
jest.mock('../components/NativeQrScannerButton', () => {
  const ReactModule = require('react');
  const { Text, TouchableOpacity } = require('react-native');
  return ({ onScanned }: { onScanned: (value: string) => void }) =>
    ReactModule.createElement(
      TouchableOpacity,
      { onPress: () => onScanned('BW1:11111111-1111-4111-8111-111111111111') },
      ReactModule.createElement(Text, null, 'Scan driver’s handoff QR'),
    );
});

jest.mock('../services/facilityIntakeApi', () => ({
  previewFacilityReceipt: jest.fn(),
  confirmFacilityReceipt: jest.fn(),
  previewFacilityReceiptByOrderId: jest.fn(),
  confirmFacilityReceiptByOrderId: jest.fn(),
}));
const preview = previewFacilityReceipt as jest.Mock;
const confirm = confirmFacilityReceipt as jest.Mock;
const previewByOrderId = previewFacilityReceiptByOrderId as jest.Mock;
const confirmByOrderId = confirmFacilityReceiptByOrderId as jest.Mock;
const code = 'BW1:11111111-1111-4111-8111-111111111111';
const detail = {
  orderId: 'order-1',
  orderNumber: 'BW-1',
  orderStatus: 'in_transit_to_facility',
  facility: { id: 'facility-1', name: 'Local Facility' },
  items: [{ item_name: 'Shirt', quantity: 2, weight_kg: 1 }],
};
beforeEach(() => {
  jest.clearAllMocks();
});

test('requires a valid order ID, previews order and confirms physical receipt once', async () => {
  previewByOrderId.mockResolvedValue(detail);
  confirmByOrderId.mockResolvedValue({ orderId: 'order-1', received: true });
  const onReceived = jest.fn();
  const view = await render(
    <FacilityIntakeScreen
      accessToken="staff-token"
      onBack={jest.fn()}
      onReceived={onReceived}
    />,
  );
  await fireEvent.press(view.getByText('Find order by ID'));
  await waitFor(() =>
    expect(
      view.getByText(
        'Enter the complete B&W order ID, for example BW-20260921-ABC12345.',
      ),
    ).toBeTruthy(),
  );
  await fireEvent.changeText(
    view.getByPlaceholderText('BW-20260921-ABC12345'),
    'bw-20260921-abc12345',
  );
  await fireEvent.press(view.getByText('Find order by ID'));
  await waitFor(() => expect(view.getByText('Order BW-1')).toBeTruthy());
  expect(view.getByText('2 × Shirt · 1 kg')).toBeTruthy();
  await fireEvent.press(view.getByText('Confirm physical receipt'));
  await waitFor(() =>
    expect(view.getByText('Order BW-1 received at facility.')).toBeTruthy(),
  );
  expect(confirmByOrderId).toHaveBeenCalledTimes(1);
  expect(confirmByOrderId).toHaveBeenCalledWith(
    'staff-token',
    'BW-20260921-ABC12345',
  );
  expect(onReceived).toHaveBeenCalledTimes(1);
});

test('native QR scan previews the handoff without manual entry', async () => {
  preview.mockResolvedValue(detail);
  const view = await render(
    <FacilityIntakeScreen
      accessToken="staff-token"
      onBack={jest.fn()}
      onReceived={jest.fn()}
    />,
  );
  fireEvent.press(view.getByText('Scan driver’s handoff QR'));
  await waitFor(() =>
    expect(preview).toHaveBeenCalledWith('staff-token', code),
  );
  expect(view.getByText('Order BW-1')).toBeTruthy();
});

test('blocks confirmation when preview has no item details', async () => {
  preview.mockResolvedValue({ ...detail, items: [] });
  const view = await render(
    <FacilityIntakeScreen
      accessToken="staff-token"
      onBack={jest.fn()}
      onReceived={jest.fn()}
    />,
  );
  previewByOrderId.mockResolvedValue({ ...detail, items: [] });
  await fireEvent.changeText(
    view.getByPlaceholderText('BW-20260921-ABC12345'),
    'BW-20260921-ABC12345',
  );
  await fireEvent.press(view.getByText('Find order by ID'));
  await waitFor(() =>
    expect(
      view.getByText(
        'No item details recorded. Check with dispatch before confirming.',
      ),
    ).toBeTruthy(),
  );
  await fireEvent.press(view.getByText('Confirm physical receipt'));
  expect(confirm).not.toHaveBeenCalled();
});

test('shows wrong-facility or duplicate receipt error without stale preview', async () => {
  previewByOrderId.mockResolvedValue(detail);
  confirmByOrderId.mockRejectedValue(
    new Error('Facility receipt is not allowed'),
  );
  const view = await render(
    <FacilityIntakeScreen
      accessToken="staff-token"
      onBack={jest.fn()}
      onReceived={jest.fn()}
    />,
  );
  await fireEvent.changeText(
    view.getByPlaceholderText('BW-20260921-ABC12345'),
    'BW-20260921-ABC12345',
  );
  await fireEvent.press(view.getByText('Find order by ID'));
  await waitFor(() => expect(view.getByText('Order BW-1')).toBeTruthy());
  await fireEvent.press(view.getByText('Confirm physical receipt'));
  await waitFor(() =>
    expect(view.getByText('Facility receipt is not allowed')).toBeTruthy(),
  );
  expect(view.queryByText('Confirm physical receipt')).toBeNull();
});
