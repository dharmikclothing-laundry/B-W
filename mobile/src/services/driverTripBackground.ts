import {NativeModules, Platform} from 'react-native';
import {API_BASE_URL} from '../config/environment';

const iosListeners = new Set<(status: string) => void>();
const notifyIos = (status: string) => iosListeners.forEach(listener => listener(status));

export function subscribeDriverTripStatus(listener: (status: string) => void) {
  iosListeners.add(listener);
  return () => {iosListeners.delete(listener);};
}

export async function startDriverTripIos(assignmentId: string, accessToken: string) {
  if (Platform.OS !== 'ios') return;
  if (!NativeModules.BWDriverTripLocation?.start) throw new Error('Background GPS is unavailable on this iPhone.');
  await NativeModules.BWDriverTripLocation.start(assignmentId, accessToken, API_BASE_URL);
  notifyIos('Sharing location during this trip, including while navigation is open.');
}

export async function stopDriverTripIos() {
  if (Platform.OS === 'ios' && NativeModules.BWDriverTripLocation?.stop) {
    await NativeModules.BWDriverTripLocation.stop();
  }
}

export async function startDriverTripBackground(assignmentId: string, accessToken: string) {
  if (Platform.OS !== 'android') return;
  if (!NativeModules.DriverTripLocation?.start) throw new Error('Background GPS is unavailable on this device.');
  await NativeModules.DriverTripLocation.start(assignmentId, accessToken, API_BASE_URL);
}

export async function stopDriverTripBackground() {
  await stopDriverTripIos();
  if (Platform.OS === 'android' && NativeModules.DriverTripLocation?.stop) {
    await NativeModules.DriverTripLocation.stop();
  }
}
