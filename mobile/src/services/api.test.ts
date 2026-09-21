import {API_TIMEOUT_MS, apiRequest} from './api';
jest.mock('../config/environment', () => ({API_BASE_URL: 'http://localhost:3000/v1'}));
jest.mock('./sessionManager', () => ({getStoredSession: jest.fn(() => null), refreshStoredSession: jest.fn()}));

afterEach(() => {jest.useRealTimers(); jest.restoreAllMocks();});
test('offline errors are readable and do not expose request details', async () => {
  globalThis.fetch = jest.fn().mockRejectedValue(new TypeError('network failed'));
  await expect(apiRequest('/orders')).rejects.toThrow('Network unavailable');
});
test('stalled writes time out without automatically retrying', async () => {
  jest.useFakeTimers();
  globalThis.fetch = jest.fn().mockImplementation(() => new Promise(() => {}));
  const request = apiRequest('/orders', {method: 'POST', body: {items: []}});
  await Promise.all([
    jest.advanceTimersByTimeAsync(API_TIMEOUT_MS),
    expect(request).rejects.toThrow('Check your orders before retrying'),
  ]);
  expect(globalThis.fetch).toHaveBeenCalledTimes(1);
});

test('stalled read requests give connection guidance rather than order-submission warnings', async () => {
  jest.useFakeTimers();
  globalThis.fetch = jest.fn().mockImplementation(() => new Promise(() => {}));
  const request = apiRequest('/services');
  await Promise.all([
    jest.advanceTimersByTimeAsync(API_TIMEOUT_MS),
    expect(request).rejects.toThrow('Check your connection and try again'),
  ]);
  expect(globalThis.fetch).toHaveBeenCalledTimes(1);
});
