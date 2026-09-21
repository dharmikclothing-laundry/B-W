import {Platform} from 'react-native';
import Config from 'react-native-config';

const developmentHost =
  Platform.OS === 'android'
    ? '10.0.2.2'
    : '127.0.0.1';
const releaseChannel = Config.BW_RELEASE_CHANNEL?.trim() === 'uat' ? 'uat' : 'production';

export const API_BASE_URL =
  __DEV__
    ? (Platform.OS === 'ios' && Config.BW_DEV_IOS_API_URL?.trim()) ||
      `http://${developmentHost}:3000/v1`
    : (releaseChannel === 'uat' ? Config.BW_UAT_API_URL : Config.BW_PRODUCTION_API_URL)?.trim() || '';

export const DEV_IOS_STORAGE_ORIGIN =
  __DEV__ && Platform.OS === 'ios'
    ? Config.BW_DEV_IOS_STORAGE_ORIGIN?.trim().replace(/\/$/, '') || ''
    : '';

export type MapsProviderMode =
  | 'google'
  | 'platform'
  | 'mock';

export const MAPS_PROVIDER:
  MapsProviderMode =
  __DEV__
    ? Platform.OS === 'android'
      ? 'mock'
      : 'platform'
    : 'google';

export function assertSafeMobileConfiguration() {
  if (!API_BASE_URL) {
    throw new Error(
      'API_BASE_URL is required for release builds.',
    );
  }

  if (
    !__DEV__ &&
    !API_BASE_URL.startsWith('https://')
  ) {
    throw new Error(
      'Release builds require an HTTPS API_BASE_URL.',
    );
  }

  if (
    !__DEV__ &&
    MAPS_PROVIDER !== 'google'
  ) {
    throw new Error(
      'Release builds require Google Maps.',
    );
  }
}
