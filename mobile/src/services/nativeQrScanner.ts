import {DataScanner} from 'react-native-data-scanner';

export async function scanOrderQr() {
  let barcode;
  try {
    barcode = await DataScanner.scanBarcode({
      targetFormats: ['qr'],
      qualityLevel: 'balanced',
      enableAutoZoom: true,
    });
  } catch (cause) {
    if (cause instanceof Error && /cancel/i.test(cause.message)) throw cause;
    throw new Error('QR scanner is unavailable on this device. Enter the handoff code instead.');
  }
  const value = barcode.value.trim();
  if (!/^BW1:[0-9a-f-]{36}$/i.test(value)) {
    throw new Error('This is not a valid B&W order QR code.');
  }
  return value;
}
