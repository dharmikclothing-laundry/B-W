import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import NativeQrScannerButton from './NativeQrScannerButton';
import {scanOrderQr} from '../services/nativeQrScanner';

jest.mock('../services/nativeQrScanner', () => ({scanOrderQr: jest.fn()}));
const scan = scanOrderQr as jest.Mock;

test('sends a native scan to the role workflow', async () => {
  scan.mockResolvedValue('BW1:11111111-1111-4111-8111-111111111111');
  const onScanned = jest.fn();
  const view = await render(<NativeQrScannerButton onScanned={onScanned} />);
  fireEvent.press(view.getByText('▣ Scan order QR'));
  await waitFor(() => expect(onScanned).toHaveBeenCalledWith('BW1:11111111-1111-4111-8111-111111111111'));
});
