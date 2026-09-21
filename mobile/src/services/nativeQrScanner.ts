import {DataScanner} from 'react-native-data-scanner';

export async function scanOrderQr() {
  const barcode = await DataScanner.scanBarcode({
    targetFormats: ['qr'],
    qualityLevel: 'balanced',
    enableAutoZoom: true,
  });
  const value = barcode.value.trim();
  if (!/^BW1:[0-9a-f-]{36}$/i.test(value)) {
    throw new Error('This is not a valid B&W order QR code.');
  }
  return value;
}
