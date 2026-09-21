// Optional Google Routes HTTP-contract substitute for isolated tests. Normal
// runtime gates use MockMapsProvider and do not load this file. Non-Google
// requests still delegate to Node's original fetch.
const originalFetch = global.fetch;

function haversineMeters(origin, destination) {
  const radians = (degrees) =>
    (degrees * Math.PI) / 180;
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = radians(
    destination.latitude -
      origin.latitude,
  );
  const longitudeDelta = radians(
    destination.longitude -
      origin.longitude,
  );
  const originLatitude = radians(
    origin.latitude,
  );
  const destinationLatitude = radians(
    destination.latitude,
  );
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(originLatitude) *
      Math.cos(destinationLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return Math.round(
    earthRadiusMeters *
      2 *
      Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a),
      ),
  );
}

global.fetch = async (
  input,
  init,
) => {
  const url =
    typeof input === 'string'
      ? input
      : input.url;

  if (
    url ===
    'https://routes.googleapis.com/directions/v2:computeRoutes'
  ) {
    const body = JSON.parse(
      String(init?.body ?? '{}'),
    );
    const origin =
      body.origin?.location?.latLng;
    const destination =
      body.destination?.location?.latLng;

    if (!origin || !destination) {
      return new Response(
        JSON.stringify({
          error: 'Missing route points',
        }),
        { status: 400 },
      );
    }

    const distanceMeters =
      haversineMeters(
        origin,
        destination,
      );
    // Stable local estimate at 25 km/h. Production still uses Google traffic.
    const durationSeconds = Math.max(
      1,
      Math.round(
        distanceMeters / 6.944,
      ),
    );

    return new Response(
      JSON.stringify({
        routes: [
          {
            distanceMeters,
            duration:
              `${durationSeconds}s`,
          },
        ],
      }),
      {
        status: 200,
        headers: {
          'content-type':
            'application/json',
        },
      },
    );
  }

  return originalFetch(input, init);
};
