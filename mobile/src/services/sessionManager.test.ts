import {clearSession, getStoredSession, persistSession} from './sessionManager';
import {clearSecureSession, saveSecureSession} from './secureSessionStorage';
jest.mock('./secureSessionStorage', () => ({clearSecureSession: jest.fn(), loadSecureSession: jest.fn(), saveSecureSession: jest.fn()}));
test('logout clears in-memory and secure persisted session', async () => {
  await persistSession({session: {access_token: 'access', refresh_token: 'refresh'}, user: {id: 'user', phone: '+919999999999'}});
  expect(getStoredSession()?.accessToken).toBe('access');
  await clearSession();
  expect(getStoredSession()).toBeNull();
  expect(saveSecureSession).toHaveBeenCalled();
  expect(clearSecureSession).toHaveBeenCalled();
});
