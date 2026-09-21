import * as Keychain from 'react-native-keychain';

const SERVICE = 'com.brightwhitemobile.order-attempt';

export type StoredOrderAttempt = {fingerprint: string; key: string};

export async function loadOrderAttempt(): Promise<StoredOrderAttempt | null> {
  const credentials = await Keychain.getGenericPassword({service: SERVICE});
  if (!credentials) return null;
  try {
    const attempt: unknown = JSON.parse(credentials.password);
    if (typeof attempt === 'object' && attempt !== null &&
      'fingerprint' in attempt && typeof attempt.fingerprint === 'string' &&
      'key' in attempt && typeof attempt.key === 'string') {
      return attempt as StoredOrderAttempt;
    }
  } catch {
    // Remove invalid local retry state below.
  }
  await clearOrderAttempt();
  return null;
}

export async function saveOrderAttempt(attempt: StoredOrderAttempt): Promise<void> {
  await Keychain.setGenericPassword('bright-white-order-attempt', JSON.stringify(attempt), {
    service: SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearOrderAttempt(): Promise<void> {
  await Keychain.resetGenericPassword({service: SERVICE});
}
