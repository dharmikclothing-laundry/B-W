import * as Keychain from 'react-native-keychain';

import type {StoredSession} from '../types/session';

const SESSION_SERVICE =
  'com.brightwhitemobile.session';

function isStoredSession(
  value: unknown,
): value is StoredSession {
  if (
    typeof value !== 'object' ||
    value === null
  ) {
    return false;
  }

  const candidate =
    value as Partial<StoredSession>;

  return (
    candidate.version === 1 &&
    typeof candidate.accessToken ===
      'string' &&
    candidate.accessToken.length > 0 &&
    typeof candidate.refreshToken ===
      'string' &&
    candidate.refreshToken.length > 0 &&
    (candidate.expiresAt === null ||
      typeof candidate.expiresAt ===
        'number')
  );
}

export async function saveSecureSession(
  session: StoredSession,
) {
  await Keychain.setGenericPassword(
    'bright-white-session',
    JSON.stringify(session),
    {
      service: SESSION_SERVICE,
      accessible:
        Keychain.ACCESSIBLE
          .WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    },
  );
}

export async function loadSecureSession(): Promise<StoredSession | null> {
  const credentials =
    await Keychain.getGenericPassword({
      service: SESSION_SERVICE,
    });

  if (!credentials) {
    return null;
  }

  try {
    const parsed: unknown =
      JSON.parse(
        credentials.password,
      );

    if (isStoredSession(parsed)) {
      return parsed;
    }
  } catch {
    // Corrupt local data is removed below.
  }

  await clearSecureSession();
  return null;
}

export async function clearSecureSession() {
  await Keychain.resetGenericPassword({
    service: SESSION_SERVICE,
  });
}
