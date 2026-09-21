import {launchCamera} from 'react-native-image-picker';
import {apiRequest} from './api';
import {captureDeliveryPhoto, completeDriverDelivery, uploadDeliveryPhoto} from './driverDeliveryApi';

jest.mock('react-native-image-picker', () => ({launchCamera: jest.fn()}));
jest.mock('./api', () => ({apiRequest: jest.fn()}));
const camera = launchCamera as jest.MockedFunction<typeof launchCamera>;
const request = apiRequest as jest.Mock;
beforeEach(() => {jest.clearAllMocks();});

test('camera capture converts a compatible iPhone image to JPG and supports cancellation', async () => {
  camera.mockResolvedValueOnce({assets: [{uri: 'file:///capture.heic', fileName: 'capture.heic', type: 'image/heic'}]});
  await expect(captureDeliveryPhoto()).resolves.toEqual({uri: 'file:///capture.heic', name: 'capture.jpg', type: 'image/jpeg'});
  expect(camera).toHaveBeenCalledWith(expect.objectContaining({mediaType: 'photo', assetRepresentationMode: 'compatible'}));
  camera.mockResolvedValueOnce({didCancel: true});
  await expect(captureDeliveryPhoto()).resolves.toBeNull();
});

test('uploads proof through the existing signed local storage contract', async () => {
  request.mockResolvedValueOnce({path: 'order-1/photo.jpg', signedUrl: 'https://local.test/upload'});
  const oldFetch = globalThis.fetch;
  globalThis.fetch = jest.fn().mockResolvedValueOnce({ok: true, blob: async () => new Blob(['photo'])}).mockResolvedValueOnce({ok: true});
  try {
    await expect(uploadDeliveryPhoto('token', 'order-1', {uri: 'file:///photo.jpg', name: 'photo.jpg', type: 'image/jpeg'}))
      .resolves.toBe('order-1/photo.jpg');
    expect(request).toHaveBeenCalledWith('/orders/order-1/delivery-proof/upload-url',
      {method: 'POST', accessToken: 'token', body: {fileName: 'photo.jpg'}});
    expect(globalThis.fetch).toHaveBeenLastCalledWith('https://local.test/upload', expect.objectContaining({method: 'PUT'}));
  } finally {globalThis.fetch = oldFetch;}
});

test('requires valid OTP and uploaded proof before calling atomic completion endpoint', async () => {
  await expect(completeDriverDelivery('token', 'order-1', '12', 'order-1/photo.jpg')).rejects.toThrow('six-digit delivery OTP');
  await expect(completeDriverDelivery('token', 'order-1', '123456', '')).rejects.toThrow('Upload a delivery photograph');
  expect(request).not.toHaveBeenCalled();
  request.mockResolvedValue({delivered: true, orderStatus: 'claim_period_active'});
  await completeDriverDelivery('token', 'order-1', ' 123456 ', 'order-1/photo.jpg');
  expect(request).toHaveBeenCalledWith('/orders/order-1/complete-delivery',
    {method: 'POST', accessToken: 'token', body: {otp: '123456', photoPath: 'order-1/photo.jpg'}});
});
