import * as Keychain from 'react-native-keychain';
import {clearOrderAttempt, loadOrderAttempt, saveOrderAttempt} from './orderAttemptStorage';

jest.mock('react-native-keychain', () => ({
  ACCESSIBLE: {WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only'},
  getGenericPassword: jest.fn(),
  setGenericPassword: jest.fn(),
  resetGenericPassword: jest.fn(),
}));

describe('persisted checkout retry', () => {
  beforeEach(() => jest.clearAllMocks());

  it('restores the same key after an app restart', async () => {
    const attempt = {fingerprint: 'checkout-contents', key: 'retry-key'};
    await saveOrderAttempt(attempt);
    const password = (Keychain.setGenericPassword as jest.Mock).mock.calls[0][1];
    (Keychain.getGenericPassword as jest.Mock).mockResolvedValueOnce({password});
    await expect(loadOrderAttempt()).resolves.toEqual(attempt);
    expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
      'bright-white-order-attempt', expect.any(String),
      expect.objectContaining({service: 'com.brightwhitemobile.order-attempt'}),
    );
  });

  it('clears retry state after checkout completion', async () => {
    await clearOrderAttempt();
    expect(Keychain.resetGenericPassword).toHaveBeenCalledWith({
      service: 'com.brightwhitemobile.order-attempt',
    });
  });
});
