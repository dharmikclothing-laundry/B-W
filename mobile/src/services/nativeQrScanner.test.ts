import {DataScanner} from 'react-native-data-scanner';
import {scanOrderQr} from './nativeQrScanner';

jest.mock('react-native-data-scanner', () => ({DataScanner: {scanBarcode: jest.fn()}}));
const scan = DataScanner.scanBarcode as jest.Mock;

beforeEach(() => scan.mockReset());

test('uses the native QR-only scanner and returns a valid handoff payload', async () => {
  const payload = 'BW1:11111111-1111-4111-8111-111111111111';
  scan.mockResolvedValue({format: 'qr', value: ` ${payload} `});
  await expect(scanOrderQr()).resolves.toBe(payload);
  expect(scan).toHaveBeenCalledWith({targetFormats: ['qr'], qualityLevel: 'balanced', enableAutoZoom: true});
});

test('rejects unrelated QR values', async () => {
  scan.mockResolvedValue({format: 'qr', value: 'https://example.com'});
  await expect(scanOrderQr()).rejects.toThrow('valid B&W order QR');
});

test('replaces native scanner failures with a safe manual-entry fallback', async () => {
  scan.mockRejectedValue(new Error('java.lang.RuntimeException: INTERNAL_ERROR (8)'));
  await expect(scanOrderQr()).rejects.toThrow(
    'QR scanner is unavailable on this device. Enter the handoff code instead.',
  );
});
