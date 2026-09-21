export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type MapsProviderName =
  | 'mock'
  | 'google';

export type RouteResult = {
  distanceMeters: number;
  durationSeconds: number;
  encodedPolyline: string | null;
  provider: MapsProviderName;
};

export type PlaceSearchResult = {
  placeId: string;
  primaryText: string;
  secondaryText: string;
  formattedText: string;
  provider: MapsProviderName;
};

export type ResolvedPlace = {
  placeId: string | null;

  formattedAddress: string;

  addressLine1: string;
  addressLine2: string;

  city: string;
  state: string;
  postalCode: string;
  country: string;

  coordinate: Coordinate;

  provider: MapsProviderName;
};

export type PlaceDetailsResult =
  ResolvedPlace;

export type ReverseGeocodeResult =
  ResolvedPlace;
