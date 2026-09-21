import type {
  SelectedLocation,
} from '../types/location';

/**
 * Development-only location.
 *
 * This prevents local development from accidentally
 * calling live Google Maps / Places / Geocoding APIs.
 *
 * Google Maps support will be added behind the same
 * interface for Testing/UAT and Production.
 */
const DEVELOPMENT_TEST_LOCATION: SelectedLocation = {
  coordinates: {
    latitude: 17.385,
    longitude: 78.4867,
  },

  formattedAddress:
    'Banjara Hills, Hyderabad, Telangana 500034',

  addressLine1:
    'Banjara Hills',

  addressLine2:
    'Hyderabad',

  city:
    'Hyderabad',

  state:
    'Telangana',

  postalCode:
    '500034',

  placeId:
    null,

  source:
    'development_mock',
};

export function getDevelopmentTestLocation():
  SelectedLocation {
  return {
    ...DEVELOPMENT_TEST_LOCATION,

    coordinates: {
      ...DEVELOPMENT_TEST_LOCATION.coordinates,
    },
  };
}
