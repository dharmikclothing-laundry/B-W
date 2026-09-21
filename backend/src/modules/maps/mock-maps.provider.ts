import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  MapsProvider,
} from './maps.provider';

import {
  Coordinate,
  PlaceDetailsResult,
  PlaceSearchResult,
  ReverseGeocodeResult,
  RouteResult,
} from './maps.types';

const DEVELOPMENT_PLACE = {
  placeId:
    'development-hyderabad-001',

  primaryText:
    'Abids',

  secondaryText:
    'Hyderabad, Telangana 500001',

  formattedAddress:
    'Abids, Hyderabad, Telangana 500001',

  addressLine1:
    'Abids',

  addressLine2:
    'Hyderabad',

  city:
    'Hyderabad',

  state:
    'Telangana',

  postalCode:
    '500001',

  country:
    'India',

  coordinate: {
    latitude:
      17.385,

    longitude:
      78.4867,
  },
} as const;

@Injectable()
export class MockMapsProvider
  implements MapsProvider
{
  readonly mode =
    'mock' as const;

  async getRoute(
    origin: Coordinate,
    destination: Coordinate,
  ): Promise<RouteResult> {
    const radians = (
      degrees: number,
    ) =>
      (degrees *
        Math.PI) /
      180;

    const earthRadiusMeters =
      6_371_000;

    const latitudeDelta =
      radians(
        destination.latitude -
          origin.latitude,
      );

    const longitudeDelta =
      radians(
        destination.longitude -
          origin.longitude,
      );

    const originLatitude =
      radians(
        origin.latitude,
      );

    const destinationLatitude =
      radians(
        destination.latitude,
      );

    const haversine =
      Math.sin(
        latitudeDelta / 2,
      ) **
        2 +
      Math.cos(
        originLatitude,
      ) *
        Math.cos(
          destinationLatitude,
        ) *
        Math.sin(
          longitudeDelta / 2,
        ) **
          2;

    const straightLineMeters =
      earthRadiusMeters *
      2 *
      Math.atan2(
        Math.sqrt(
          haversine,
        ),
        Math.sqrt(
          1 -
            haversine,
        ),
      );

    const distanceMeters =
      Math.round(
        straightLineMeters *
          1.25,
      );

    const metersPerSecond =
      25_000 /
      3_600;

    const durationSeconds =
      distanceMeters === 0
        ? 0
        : Math.max(
            1,
            Math.round(
              distanceMeters /
                metersPerSecond,
            ),
          );

    return {
      distanceMeters,
      durationSeconds,
      encodedPolyline:
        null,
      provider:
        'mock',
    };
  }

  async searchPlaces(
    query: string,
  ): Promise<
    PlaceSearchResult[]
  > {
    const normalized =
      query
        .trim()
        .toLowerCase();

    if (
      normalized.length <
      2
    ) {
      return [];
    }

    return [
      {
        placeId:
          DEVELOPMENT_PLACE.placeId,

        primaryText:
          DEVELOPMENT_PLACE.primaryText,

        secondaryText:
          DEVELOPMENT_PLACE.secondaryText,

        formattedText:
          DEVELOPMENT_PLACE.formattedAddress,

        provider:
          'mock',
      },
    ];
  }

  async getPlaceDetails(
    placeId: string,
  ): Promise<PlaceDetailsResult> {
    if (
      placeId !==
      DEVELOPMENT_PLACE.placeId
    ) {
      throw new NotFoundException(
        'Mock place was not found',
      );
    }

    return {
      placeId:
        DEVELOPMENT_PLACE.placeId,

      formattedAddress:
        DEVELOPMENT_PLACE.formattedAddress,

      addressLine1:
        DEVELOPMENT_PLACE.addressLine1,

      addressLine2:
        DEVELOPMENT_PLACE.addressLine2,

      city:
        DEVELOPMENT_PLACE.city,

      state:
        DEVELOPMENT_PLACE.state,

      postalCode:
        DEVELOPMENT_PLACE.postalCode,

      country:
        DEVELOPMENT_PLACE.country,

      coordinate: {
        ...DEVELOPMENT_PLACE.coordinate,
      },

      provider:
        'mock',
    };
  }

  async reverseGeocode(
    coordinate: Coordinate,
  ): Promise<ReverseGeocodeResult> {
    return {
      placeId:
        DEVELOPMENT_PLACE.placeId,

      formattedAddress:
        DEVELOPMENT_PLACE.formattedAddress,

      addressLine1:
        DEVELOPMENT_PLACE.addressLine1,

      addressLine2:
        DEVELOPMENT_PLACE.addressLine2,

      city:
        DEVELOPMENT_PLACE.city,

      state:
        DEVELOPMENT_PLACE.state,

      postalCode:
        DEVELOPMENT_PLACE.postalCode,

      country:
        DEVELOPMENT_PLACE.country,

      coordinate: {
        latitude:
          coordinate.latitude,

        longitude:
          coordinate.longitude,
      },

      provider:
        'mock',
    };
  }
}
