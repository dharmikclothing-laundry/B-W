import * as Keychain from 'react-native-keychain';
import {clearSecureSession, loadSecureSession, saveSecureSession} from './secureSessionStorage';

jest.mock('react-native-keychain', () => ({
  ACCESSIBLE: {WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only'},
  setGenericPassword: jest.fn(), getGenericPassword: jest.fn(), resetGenericPassword: jest.fn(),
}));
const keychain = Keychain as jest.Mocked<typeof Keychain>;
const session = {version: 1 as const, accessToken: 'access', refreshToken: 'refresh',
  expiresAt: null, phone: '+16505550102', userId: 'fictional-driver', profile: {accountRole: 'driver'}};

beforeEach(() => jest.clearAllMocks());

test('Driver session uses device-only secure storage and can be restored', async () => {
  await saveSecureSession(session);
  expect(keychain.setGenericPassword).toHaveBeenCalledWith('bright-white-session',
    JSON.stringify(session), {service: 'com.brightwhitemobile.session', accessible: 'device-only'});
  (keychain.getGenericPassword as jest.Mock).mockResolvedValue({username: 'bright-white-session', password: JSON.stringify(session)});
  await expect(loadSecureSession()).resolves.toEqual(session);
});

test('corrupt stored session is removed and logout deletes the secure entry', async () => {
  (keychain.getGenericPassword as jest.Mock).mockResolvedValue({username: 'bright-white-session', password: '{broken'});
  await expect(loadSecureSession()).resolves.toBeNull();
  expect(keychain.resetGenericPassword).toHaveBeenCalledWith({service: 'com.brightwhitemobile.session'});
  await clearSecureSession();
  expect(keychain.resetGenericPassword).toHaveBeenCalledTimes(2);
});
