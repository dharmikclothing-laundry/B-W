import { MockMapsProvider } from './mock-maps.provider';

describe('MockMapsProvider', () => {
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

  it('returns deterministic road estimates without external HTTP calls', async () => {
    global.fetch = jest.fn();
    const provider = new MockMapsProvider();

    const first = await provider.getRoute(origin, destination);
    const second = await provider.getRoute(origin, destination);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      provider: 'mock',
      encodedPolyline: null,
    });
    expect(first.distanceMeters).toBeGreaterThan(0);
    expect(first.durationSeconds).toBeGreaterThan(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns customer-readable mock address labels consistently', async () => {
    const provider = new MockMapsProvider();
    const [place] = await provider.searchPlaces('Abids');
    const details = await provider.getPlaceDetails(place.placeId);
    const reverse = await provider.reverseGeocode(origin);
    expect(place.primaryText).toBe('Abids');
    expect(details.addressLine1).toBe('Abids');
    expect(reverse.formattedAddress).toBe(place.formattedText);
    expect(JSON.stringify([place, details, reverse])).not.toMatch(/Test Address/);
  });

  it('handles identical route points as a zero-length route', async () => {
    const provider = new MockMapsProvider();

    await expect(provider.getRoute(origin, origin)).resolves.toEqual({
      distanceMeters: 0,
      durationSeconds: 0,
      encodedPolyline: null,
      provider: 'mock',
    });
  });
});
