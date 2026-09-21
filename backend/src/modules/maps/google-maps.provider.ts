import {
  BadGatewayException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
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

type AddressComponent = {
  longText?: string;
  shortText?: string;

  long_name?: string;
  short_name?: string;

  types?: string[];
};

@Injectable()
export class GoogleMapsProvider
  implements MapsProvider
{
  readonly mode =
    'live' as const;

  constructor(
    private readonly serverKey:
      string,
  ) {
    if (
      !serverKey
    ) {
      throw new ServiceUnavailableException(
        'Google Maps server API key is not configured',
      );
    }
  }

  private getComponent(
    components:
      AddressComponent[],
    type:
      string,
  ): string {
    const component =
      components.find(
        item =>
          Array.isArray(
            item.types,
          ) &&
          item.types.includes(
            type,
          ),
      );

    if (
      !component
    ) {
      return '';
    }

    return (
      component.longText ??
      component.long_name ??
      component.shortText ??
      component.short_name ??
      ''
    );
  }

  private resolveAddressParts(
    components:
      AddressComponent[],
  ) {
    const streetNumber =
      this.getComponent(
        components,
        'street_number',
      );

    const route =
      this.getComponent(
        components,
        'route',
      );

    const premise =
      this.getComponent(
        components,
        'premise',
      );

    const subpremise =
      this.getComponent(
        components,
        'subpremise',
      );

    const neighborhood =
      this.getComponent(
        components,
        'neighborhood',
      );

    const sublocalityLevel1 =
      this.getComponent(
        components,
        'sublocality_level_1',
      );

    const sublocality =
      this.getComponent(
        components,
        'sublocality',
      );

    const locality =
      this.getComponent(
        components,
        'locality',
      );

    const administrativeAreaLevel3 =
      this.getComponent(
        components,
        'administrative_area_level_3',
      );

    const administrativeAreaLevel2 =
      this.getComponent(
        components,
        'administrative_area_level_2',
      );

    const state =
      this.getComponent(
        components,
        'administrative_area_level_1',
      );

    const postalCode =
      this.getComponent(
        components,
        'postal_code',
      );

    const country =
      this.getComponent(
        components,
        'country',
      );

    const streetAddress =
      [
        streetNumber,
        route,
      ]
        .filter(Boolean)
        .join(' ')
        .trim();

    const addressLine1 =
      [
        subpremise,
        premise,
        streetAddress,
      ]
        .filter(Boolean)
        .join(', ');

    const addressLine2 =
      sublocalityLevel1 ||
      sublocality ||
      neighborhood ||
      '';

    const city =
      locality ||
      administrativeAreaLevel3 ||
      administrativeAreaLevel2 ||
      '';

    return {
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      country,
    };
  }

  private async readJson(
    response:
      Response,
    serviceName:
      string,
  ): Promise<any> {
    try {
      return await response.json();
    } catch {
      throw new BadGatewayException(
        `${serviceName} returned an invalid response`,
      );
    }
  }

  async getRoute(
    origin:
      Coordinate,

    destination:
      Coordinate,
  ): Promise<RouteResult> {
    let response:
      Response;

    try {
      response =
        await fetch(
          'https://routes.googleapis.com/directions/v2:computeRoutes',
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',

              'X-Goog-Api-Key':
                this.serverKey,

              'X-Goog-FieldMask':
                'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
            },

            body:
              JSON.stringify({
                origin: {
                  location: {
                    latLng:
                      origin,
                  },
                },

                destination: {
                  location: {
                    latLng:
                      destination,
                  },
                },

                travelMode:
                  'DRIVE',

                routingPreference:
                  'TRAFFIC_AWARE',
              }),

            signal:
              AbortSignal.timeout(
                8_000,
              ),
          },
        );
    } catch {
      throw new BadGatewayException(
        'Google Maps Routes API is unavailable',
      );
    }

    if (
      !response.ok
    ) {
      throw new BadGatewayException(
        `Google Maps Routes API returned HTTP ${response.status}`,
      );
    }

    const json =
      await this.readJson(
        response,
        'Google Maps Routes API',
      );

    const route =
      json?.routes?.[0];

    const duration =
      typeof route?.duration ===
      'string'
        ? Number(
            route.duration.replace(
              /s$/,
              '',
            ),
          )
        : Number.NaN;

    const distance =
      Number(
        route?.distanceMeters,
      );

    if (
      !Number.isFinite(
        distance,
      ) ||
      distance < 0 ||
      !Number.isFinite(
        duration,
      ) ||
      duration < 0
    ) {
      throw new BadGatewayException(
        'Google Maps Routes API returned no usable route',
      );
    }

    return {
      distanceMeters:
        distance,

      durationSeconds:
        duration,

      encodedPolyline:
        route?.polyline
          ?.encodedPolyline ??
        null,

      provider:
        'google',
    };
  }

  async searchPlaces(
    query:
      string,
  ): Promise<
    PlaceSearchResult[]
  > {
    const normalizedQuery =
      query.trim();

    if (
      normalizedQuery.length <
      2
    ) {
      return [];
    }

    let response:
      Response;

    try {
      response =
        await fetch(
          'https://places.googleapis.com/v1/places:autocomplete',
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',

              'X-Goog-Api-Key':
                this.serverKey,

              'X-Goog-FieldMask':
                [
                  'suggestions.placePrediction.placeId',
                  'suggestions.placePrediction.text.text',
                  'suggestions.placePrediction.structuredFormat.mainText.text',
                  'suggestions.placePrediction.structuredFormat.secondaryText.text',
                ].join(','),
            },

            body:
              JSON.stringify({
                input:
                  normalizedQuery,

                includedRegionCodes: [
                  'in',
                ],

                languageCode:
                  'en',
              }),

            signal:
              AbortSignal.timeout(
                8_000,
              ),
          },
        );
    } catch {
      throw new BadGatewayException(
        'Google Places Autocomplete API is unavailable',
      );
    }

    if (
      !response.ok
    ) {
      throw new BadGatewayException(
        `Google Places Autocomplete API returned HTTP ${response.status}`,
      );
    }

    const json =
      await this.readJson(
        response,
        'Google Places Autocomplete API',
      );

    const suggestions =
      Array.isArray(
        json?.suggestions,
      )
        ? json.suggestions
        : [];

    return suggestions
      .map(
        (
          suggestion:
            any,
        ) => {
          const prediction =
            suggestion
              ?.placePrediction;

          if (
            !prediction
              ?.placeId
          ) {
            return null;
          }

          const primaryText =
            prediction
              ?.structuredFormat
              ?.mainText
              ?.text ??
            prediction
              ?.text
              ?.text ??
            '';

          const secondaryText =
            prediction
              ?.structuredFormat
              ?.secondaryText
              ?.text ??
            '';

          const formattedText =
            prediction
              ?.text
              ?.text ??
            [
              primaryText,
              secondaryText,
            ]
              .filter(Boolean)
              .join(', ');

          return {
            placeId:
              prediction.placeId,

            primaryText,

            secondaryText,

            formattedText,

            provider:
              'google' as const,
          };
        },
      )
      .filter(
        (
          result:
            PlaceSearchResult |
            null,
        ): result is PlaceSearchResult =>
          result !==
          null,
      );
  }

  async getPlaceDetails(
    placeId:
      string,
  ): Promise<PlaceDetailsResult> {
    const normalizedPlaceId =
      placeId.trim();

    if (
      !normalizedPlaceId
    ) {
      throw new NotFoundException(
        'Place ID is required',
      );
    }

    const url =
      new URL(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(
          normalizedPlaceId,
        )}`,
      );

    url.searchParams.set(
      'languageCode',
      'en',
    );

    url.searchParams.set(
      'regionCode',
      'IN',
    );

    let response:
      Response;

    try {
      response =
        await fetch(
          url,
          {
            method:
              'GET',

            headers: {
              'Content-Type':
                'application/json',

              'X-Goog-Api-Key':
                this.serverKey,

              'X-Goog-FieldMask':
                [
                  'id',
                  'formattedAddress',
                  'location',
                  'addressComponents',
                ].join(','),
            },

            signal:
              AbortSignal.timeout(
                8_000,
              ),
          },
        );
    } catch {
      throw new BadGatewayException(
        'Google Place Details API is unavailable',
      );
    }

    if (
      response.status ===
      404
    ) {
      throw new NotFoundException(
        'Google place was not found',
      );
    }

    if (
      !response.ok
    ) {
      throw new BadGatewayException(
        `Google Place Details API returned HTTP ${response.status}`,
      );
    }

    const json =
      await this.readJson(
        response,
        'Google Place Details API',
      );

    const latitude =
      Number(
        json?.location
          ?.latitude,
      );

    const longitude =
      Number(
        json?.location
          ?.longitude,
      );

    if (
      !Number.isFinite(
        latitude,
      ) ||
      !Number.isFinite(
        longitude,
      )
    ) {
      throw new BadGatewayException(
        'Google Place Details API returned invalid coordinates',
      );
    }

    const components:
      AddressComponent[] =
      Array.isArray(
        json
          ?.addressComponents,
      )
        ? json.addressComponents
        : [];

    const parts =
      this.resolveAddressParts(
        components,
      );

    return {
      placeId:
        json?.id ??
        normalizedPlaceId,

      formattedAddress:
        json
          ?.formattedAddress ??
        '',

      addressLine1:
        parts.addressLine1,

      addressLine2:
        parts.addressLine2,

      city:
        parts.city,

      state:
        parts.state,

      postalCode:
        parts.postalCode,

      country:
        parts.country,

      coordinate: {
        latitude,
        longitude,
      },

      provider:
        'google',
    };
  }

  async reverseGeocode(
    coordinate:
      Coordinate,
  ): Promise<ReverseGeocodeResult> {
    const url =
      new URL(
        'https://maps.googleapis.com/maps/api/geocode/json',
      );

    url.searchParams.set(
      'latlng',
      `${coordinate.latitude},${coordinate.longitude}`,
    );

    url.searchParams.set(
      'language',
      'en',
    );

    url.searchParams.set(
      'region',
      'in',
    );

    url.searchParams.set(
      'key',
      this.serverKey,
    );

    let response:
      Response;

    try {
      response =
        await fetch(
          url,
          {
            method:
              'GET',

            signal:
              AbortSignal.timeout(
                8_000,
              ),
          },
        );
    } catch {
      throw new BadGatewayException(
        'Google Geocoding API is unavailable',
      );
    }

    if (
      !response.ok
    ) {
      throw new BadGatewayException(
        `Google Geocoding API returned HTTP ${response.status}`,
      );
    }

    const json =
      await this.readJson(
        response,
        'Google Geocoding API',
      );

    if (
      json?.status ===
      'ZERO_RESULTS'
    ) {
      throw new NotFoundException(
        'No address was found for this location',
      );
    }

    if (
      json?.status !==
      'OK'
    ) {
      throw new BadGatewayException(
        `Google Geocoding API returned status ${json?.status ?? 'UNKNOWN'}`,
      );
    }

    const result =
      json?.results?.[0];

    if (
      !result
    ) {
      throw new NotFoundException(
        'No address was found for this location',
      );
    }

    const components:
      AddressComponent[] =
      Array.isArray(
        result
          ?.address_components,
      )
        ? result.address_components
        : [];

    const parts =
      this.resolveAddressParts(
        components,
      );

    return {
      placeId:
        result?.place_id ??
        null,

      formattedAddress:
        result
          ?.formatted_address ??
        '',

      addressLine1:
        parts.addressLine1,

      addressLine2:
        parts.addressLine2,

      city:
        parts.city,

      state:
        parts.state,

      postalCode:
        parts.postalCode,

      country:
        parts.country,

      coordinate: {
        latitude:
          coordinate.latitude,

        longitude:
          coordinate.longitude,
      },

      provider:
        'google',
    };
  }
}
