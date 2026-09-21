import {apiRequest} from './api';
import {canRaiseClaim, chooseClaimPhoto, createClaim, deviceReachableUploadUrl, getOrderClaims, uploadClaimPhoto} from './claimsApi';
import {launchCamera, launchImageLibrary} from 'react-native-image-picker';

jest.mock('./api', () => ({apiRequest: jest.fn()}));
jest.mock('react-native-image-picker', () => ({launchCamera: jest.fn(), launchImageLibrary: jest.fn()}));
const request = apiRequest as jest.MockedFunction<typeof apiRequest>;
const picker = launchImageLibrary as jest.MockedFunction<typeof launchImageLibrary>;
const camera = launchCamera as jest.MockedFunction<typeof launchCamera>;

describe('customer claim integration', () => {
  beforeEach(() => jest.clearAllMocks());

  it('limits the claim form to an active seven day window', () => {
    const future = new Date(Date.now() + 60000).toISOString();
    const past = new Date(Date.now() - 60000).toISOString();
    expect(canRaiseClaim('claim_period_active', future)).toBe(true);
    expect(canRaiseClaim('claim_period_active', past)).toBe(false);
    expect(canRaiseClaim('delivered', future)).toBe(false);
  });

  it('validates description and submits the allowed type through the existing endpoint', async () => {
    await expect(createClaim('token', 'order-1', 'damage', 'short')).rejects.toThrow('10 to 4000');
    expect(request).not.toHaveBeenCalled();
    request.mockResolvedValueOnce({id: 'claim-1'});
    await createClaim('token', 'order-1', 'missing_item', 'One shirt is missing', 'request-1');
    expect(request).toHaveBeenCalledWith('/orders/order-1/claims', expect.objectContaining({
      method: 'POST', body: {clientRequestId: 'request-1', claimType: 'missing_item', description: 'One shirt is missing'},
    }));
  });

  it('loads status history and handles an invalid response', async () => {
    request.mockResolvedValueOnce([{id: 'claim-1', status: 'under_review'}]);
    await expect(getOrderClaims('token', 'order-1')).resolves.toMatchObject([{status: 'under_review'}]);
    request.mockResolvedValueOnce({});
    await expect(getOrderClaims('token', 'order-1')).rejects.toThrow('Unable to load claims');
  });

  it('uses the signed upload and attaches its path only after upload succeeds', async () => {
    picker.mockResolvedValueOnce({assets: [{uri: 'file:///photo.jpg', fileName: 'photo.jpg', type: 'image/jpeg'}]});
    const photo = await chooseClaimPhoto();
    expect(photo).toMatchObject({name: 'photo.jpg'});
    request.mockResolvedValueOnce({path: 'private/photo.jpg', signedUrl: 'https://local.test/upload'});
    request.mockResolvedValueOnce({id: 'photo-1'});
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn().mockResolvedValueOnce({ok: true, blob: async () => 'binary'}).mockResolvedValueOnce({ok: true}) as any;
    try {
      await uploadClaimPhoto('token', 'claim-1', photo!);
      expect(globalThis.fetch).toHaveBeenCalledWith('https://local.test/upload', expect.objectContaining({method: 'PUT'}));
      expect(request).toHaveBeenLastCalledWith('/claims/claim-1/photos', expect.objectContaining({body: {photoPath: 'private/photo.jpg'}}));
    } finally {globalThis.fetch = originalFetch;}
  });

  it('accepts a camera photo for the same claim upload flow', async () => {
    camera.mockResolvedValueOnce({assets: [{uri: 'file:///camera.heic', fileName: 'camera.heic', type: 'image/heic'}]});
    await expect(chooseClaimPhoto('camera')).resolves.toMatchObject({name: 'camera.jpg'});
    expect(camera).toHaveBeenCalledWith(expect.objectContaining({mediaType: 'photo'}));
  });

  it('rewrites only local signed Storage URLs for a physical iPhone', () => {
    const local = 'http://127.0.0.1:54321/storage/v1/upload?token=test';
    expect(deviceReachableUploadUrl(local, 'http://192.168.29.103:54321'))
      .toBe('http://192.168.29.103:54321/storage/v1/upload?token=test');
    expect(deviceReachableUploadUrl('https://storage.example/upload?token=test', 'http://192.168.29.103:54321'))
      .toBe('https://storage.example/upload?token=test');
  });

  it('does not attach a photo when the signed upload fails', async () => {
    request.mockResolvedValueOnce({path: 'private/photo.jpg', signedUrl: 'https://local.test/upload'});
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn().mockResolvedValueOnce({ok: true, blob: async () => 'binary'}).mockResolvedValueOnce({ok: false}) as any;
    try {
      await expect(uploadClaimPhoto('token', 'claim-1', {uri: 'file:///photo.jpg', name: 'photo.jpg', type: 'image/jpeg'})).rejects.toThrow('Photograph upload failed');
      expect(request).toHaveBeenCalledTimes(1);
    } finally {globalThis.fetch = originalFetch;}
  });
});

test('iOS library JPEG MIME alias is accepted and canonicalized for upload', async () => {
  picker.mockResolvedValueOnce({assets: [{uri: 'file:///sample.jpg', fileName: 'sample.jpg', type: 'image/jpg'}]});
  await expect(chooseClaimPhoto()).resolves.toEqual({uri: 'file:///sample.jpg', name: 'sample.jpg', type: 'image/jpeg'});
});
test('unsupported library formats are not merely renamed to JPEG', async () => {
  picker.mockResolvedValueOnce({assets: [{uri: 'file:///sample.heic', fileName: 'sample.heic', type: 'image/heic'}]});
  await expect(chooseClaimPhoto()).rejects.toThrow('Select a JPG, PNG, or WEBP');
});
