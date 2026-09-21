import {
  PermissionsAndroid,
  Platform,
} from 'react-native';

import Geolocation from '@react-native-community/geolocation';

import type {
  LocationCoordinates,
} from '../types/location';

export async function requestAndroidLocationPermission():
  Promise<boolean> {
  if (
    Platform.OS !== 'android'
  ) {
    return true;
  }

  const permission =
    PermissionsAndroid.PERMISSIONS
      .ACCESS_FINE_LOCATION;

  const alreadyGranted =
    await PermissionsAndroid.check(
      permission,
    );

  if (
    alreadyGranted
  ) {
    return true;
  }

  const result =
    await PermissionsAndroid.request(
      permission,
      {
        title:
          'Bright & White Location',
        message:
          'Bright & White uses your location to select the correct laundry pickup and delivery address.',
        buttonPositive:
          'Allow',
        buttonNegative:
          'Cancel',
      },
    );

  return (
    result ===
    PermissionsAndroid.RESULTS.GRANTED
  );
}

export async function getCurrentDeviceLocation():
  Promise<LocationCoordinates> {
  if (Platform.OS === 'ios') {
    Geolocation.setRNConfiguration({skipPermissionRequests: false, authorizationLevel: 'whenInUse'});
  }
  const permissionGranted =
    await requestAndroidLocationPermission();

  if (
    !permissionGranted
  ) {
    throw new Error(
      'Location permission was not granted',
    );
  }

  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      position => {
        resolve({
          latitude:
            position.coords.latitude,
          longitude:
            position.coords.longitude,
        });
      },
      error => {
        reject(
          new Error(
            error.message ||
              'Unable to determine current location',
          ),
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000,
      },
    );
  });
}
