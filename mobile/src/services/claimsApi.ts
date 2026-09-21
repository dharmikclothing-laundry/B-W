import {launchCamera, launchImageLibrary, type Asset} from 'react-native-image-picker';
import {apiRequest} from './api';
import {DEV_IOS_STORAGE_ORIGIN} from '../config/environment';

export type ClaimType = 'damage' | 'missing_item' | 'quality' | 'delivery' | 'other';
export const CLAIM_TYPES: ReadonlyArray<{value: ClaimType; label: string}> = [
  {value: 'damage', label: 'Damaged'},
  {value: 'missing_item', label: 'Missing item'},
  {value: 'quality', label: 'Wrong item or quality'},
  {value: 'delivery', label: 'Delivery issue'},
  {value: 'other', label: 'Other'},
];

export type CustomerClaim = {
  id: string;
  status: string;
  claim_type: ClaimType;
  description: string;
  created_at: string;
  customer_claim_photos?: unknown[];
};

export type ClaimPhoto = {uri: string; name: string; type: string};

export function canRaiseClaim(status: string, deadline?: string | null) {
  return status === 'claim_period_active' &&
    Boolean(deadline && Date.parse(deadline) > Date.now());
}

export async function getOrderClaims(token: string, orderId: string) {
  const claims = await apiRequest<CustomerClaim[]>(`/orders/${orderId}/claims`, {accessToken: token});
  if (!Array.isArray(claims)) throw new Error('Unable to load claims.');
  return claims;
}

function newRequestId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, digit => {
    const random = Math.floor(Math.random() * 16);
    return (digit === 'x' ? random : (random % 4) + 8).toString(16);
  });
}

export async function createClaim(
  token: string, orderId: string, claimType: ClaimType, description: string,
  clientRequestId = newRequestId(),
) {
  const trimmed = description.trim();
  if (!CLAIM_TYPES.some(option => option.value === claimType)) throw new Error('Select a claim reason.');
  if (trimmed.length < 10 || trimmed.length > 4000) {
    throw new Error('Describe the issue in 10 to 4000 characters.');
  }
  return apiRequest<CustomerClaim>(`/orders/${orderId}/claims`, {
    method: 'POST', accessToken: token,
    body: {clientRequestId, claimType, description: trimmed},
  });
}

export async function chooseClaimPhoto(source: 'library' | 'camera' = 'library'): Promise<ClaimPhoto | null> {
  const options = {
    mediaType: 'photo' as const,
    quality: 0.8 as const,
    assetRepresentationMode: 'compatible' as const,
  };
  const result = source === 'camera'
    ? await launchCamera(options)
    : await launchImageLibrary({...options, selectionLimit: 1});
  if (result.didCancel) return null;
  if (result.errorCode) throw new Error(result.errorMessage || 'Unable to select photograph.');
  const asset: Asset | undefined = result.assets?.[0];
  if (source === 'camera' && asset?.uri) {
    const baseName = (asset.fileName || `claim-camera-${Date.now()}`).replace(/\.[^.]+$/, '');
    return {uri: asset.uri, name: `${baseName}.jpg`, type: 'image/jpeg'};
  }
  // The native iOS picker reports JPEG bytes as image/jpg. Storage uses the
  // canonical MIME type; this is an alias normalization, not image conversion.
  const type = asset?.type === 'image/jpg' ? 'image/jpeg' : asset?.type;
  if (!asset?.uri || !asset.fileName || !type ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(type)) {
    throw new Error('Select a JPG, PNG, or WEBP photograph.');
  }
  return {uri: asset.uri, name: asset.fileName, type};
}

export async function uploadClaimPhoto(token: string, claimId: string, photo: ClaimPhoto) {
  const upload = await apiRequest<{path: string; signedUrl: string}>(
    `/claims/${claimId}/photos/upload-url`,
    {method: 'POST', accessToken: token, body: {fileName: photo.name}},
  );
  if (!upload.path || !upload.signedUrl) throw new Error('Unable to prepare claim photo upload.');

  const localFile = await fetch(photo.uri);
  if (!localFile.ok) throw new Error('Unable to read the selected photograph.');
  const blob = await localFile.blob();
  const response = await fetch(deviceReachableUploadUrl(upload.signedUrl), {
    method: 'PUT', headers: {'Content-Type': photo.type}, body: blob,
  });
  if (!response.ok) throw new Error('Photograph upload failed. Please retry.');

  return apiRequest(`/claims/${claimId}/photos`, {
    method: 'POST', accessToken: token, body: {photoPath: upload.path},
  });
}

export function deviceReachableUploadUrl(signedUrl: string, localOrigin = DEV_IOS_STORAGE_ORIGIN) {
  if (!localOrigin) return signedUrl;
  return signedUrl.replace(/^http:\/\/(?:127\.0\.0\.1|localhost):54321(?=\/)/, localOrigin);
}
