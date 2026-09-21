import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GoogleMapsProvider } from './google-maps.provider';

describe('GoogleMapsProvider', () => {
  const originalFetch = global.fetch;
  const origin = {
    latitude: 17.4401,
    longitude: 78.3489,
  };
  const destination = {
    latitude: 17.385,
    longitude: 78.4867,
  };

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('requires a server key', () => {
    expect(() => new GoogleMapsProvider('')).toThrow(
      ServiceUnavailableException,
    );
  });

  it('parses a valid Google Routes response without making a real call', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        routes: [
          {
            distanceMeters: 12_345,
            duration: '987.5s',
            polyline: { encodedPolyline: 'encoded-route' },
          },
        ],
      }),
    } as Response);
    const provider = new GoogleMapsProvider('unit-test-key');

    await expect(provider.getRoute(origin, destination)).resolves.toEqual({
      distanceMeters: 12_345,
      durationSeconds: 987.5,
      encodedPolyline: 'encoded-route',
      provider: 'google',
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://routes.googleapis.com/directions/v2:computeRoutes',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Goog-FieldMask': expect.stringContaining(
            'routes.polyline.encodedPolyline',
          ),
        }),
      }),
    );
  });

  it('converts a network failure to a controlled application error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network unavailable'));
    const provider = new GoogleMapsProvider('unit-test-key');

    await expect(provider.getRoute(origin, destination)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('does not expose a rejected provider response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
    } as Response);
    const provider = new GoogleMapsProvider('unit-test-key');

    await expect(provider.getRoute(origin, destination)).rejects.toMatchObject({
      message: 'Google Maps Routes API returned HTTP 403',
    });
  });

  it.each([
    {
      name: 'malformed JSON',
      response: {
        ok: true,
        json: async () => {
          throw new SyntaxError('invalid JSON');
        },
      },
    },
    {
      name: 'a missing route',
      response: {
        ok: true,
        json: async () => ({ routes: [] }),
      },
    },
    {
      name: 'a null response',
      response: {
        ok: true,
        json: async () => null,
      },
    },
    {
      name: 'negative route metrics',
      response: {
        ok: true,
        json: async () => ({
          routes: [{ distanceMeters: -1, duration: '-1s' }],
        }),
      },
    },
  ])('rejects $name as a controlled application error', async ({ response }) => {
    global.fetch = jest.fn().mockResolvedValue(response as Response);
    const provider = new GoogleMapsProvider('unit-test-key');

    await expect(provider.getRoute(origin, destination)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });
});
