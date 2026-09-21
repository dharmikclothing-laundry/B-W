import {launchCamera, type Asset} from 'react-native-image-picker';
import {apiRequest} from './api';
import {deviceReachableUploadUrl} from './claimsApi';

export type DeliveryPhoto = {uri: string; name: string; type: string};

export async function captureDeliveryPhoto(): Promise<DeliveryPhoto | null> {
  const result = await launchCamera({mediaType: 'photo', quality: 0.8,
    assetRepresentationMode: 'compatible'});
  if (result.didCancel) return null;
  if (result.errorCode) throw new Error(result.errorMessage || 'Unable to take delivery photograph.');
  const asset: Asset | undefined = result.assets?.[0];
  if (!asset?.uri) throw new Error('Take a JPG delivery photograph.');
  const baseName = (asset.fileName || `delivery-${Date.now()}`).replace(/\.[^.]+$/, '');
  return {uri: asset.uri, name: `${baseName}.jpg`, type: 'image/jpeg'};
}

export async function uploadDeliveryPhoto(token: string, orderId: string, photo: DeliveryPhoto) {
  if (!photo.uri || !photo.name || photo.type !== 'image/jpeg') throw new Error('Take a JPG delivery photograph.');
  const upload = await apiRequest<{path: string; signedUrl: string}>(
    `/orders/${encodeURIComponent(orderId)}/delivery-proof/upload-url`,
    {method: 'POST', accessToken: token, body: {fileName: photo.name}},
  );
  if (!upload.path?.startsWith(`${orderId}/`) || !upload.signedUrl) throw new Error('Unable to prepare delivery proof upload.');
  const localFile = await fetch(photo.uri);
  if (!localFile.ok) throw new Error('Unable to read the delivery photograph.');
  const response = await fetch(deviceReachableUploadUrl(upload.signedUrl), {
    method: 'PUT', headers: {'Content-Type': photo.type}, body: await localFile.blob(),
  });
  if (!response.ok) throw new Error('Delivery photograph upload failed. Please retry.');
  return upload.path;
}

export function completeDriverDelivery(token: string, orderId: string, otp: string, photoPath: string) {
  const code = otp.trim();
  if (!/^\d{6}$/.test(code)) return Promise.reject(new Error('Enter the six-digit delivery OTP.'));
  if (!photoPath.startsWith(`${orderId}/`)) return Promise.reject(new Error('Upload a delivery photograph before completing delivery.'));
  return apiRequest<{delivered: boolean; orderStatus: string}>(
    `/orders/${encodeURIComponent(orderId)}/complete-delivery`,
    {method: 'POST', accessToken: token, body: {otp: code, photoPath}},
  );
}
