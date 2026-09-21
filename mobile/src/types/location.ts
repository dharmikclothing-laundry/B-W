export type LocationCoordinates = {
  latitude: number;
  longitude: number;
};

export type SelectedLocation = {
  coordinates: LocationCoordinates;

  formattedAddress: string;

  addressLine1: string;
  addressLine2: string;

  city: string;
  state: string;
  postalCode: string;

  placeId: string | null;

  source:
    | 'development_mock'
    | 'google_maps'
    | 'device_location';
};
