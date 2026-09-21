import {
  getProviderConfiguration,
  validateProviderConfiguration,
} from './provider-config';

describe('provider configuration', () => {
  const liveMaps = {
    GOOGLE_MAPS_MODE: 'live',
    GOOGLE_MAPS_SERVER_KEY: 'unit-test-maps-key',
  };
  const liveRazorpay = {
    RAZORPAY_MODE: 'live',
    RAZORPAY_KEY_ID: 'unit-test-key-id',
    RAZORPAY_KEY_SECRET: 'unit-test-key-secret',
    RAZORPAY_WEBHOOK_SECRET: 'unit-test-webhook-secret',
  };

  it.each(['development', 'test'])(
    'defaults provider modes to mock in %s',
    (nodeEnv) => {
      expect(getProviderConfiguration({ NODE_ENV: nodeEnv })).toMatchObject({
        maps: { mode: 'mock', configured: true },
        payments: { mode: 'mock', configured: true },
      });
    },
  );

  it('writes documented development defaults into validated configuration', () => {
    expect(
      validateProviderConfiguration({ NODE_ENV: 'development' }),
    ).toMatchObject({
      GOOGLE_MAPS_MODE: 'mock',
      RAZORPAY_MODE: 'mock',
    });
  });

  it('does not default missing provider modes when NODE_ENV is absent', () => {
    expect(() => getProviderConfiguration({})).toThrow(
      'GOOGLE_MAPS_MODE must be explicitly set outside development and test',
    );
  });

  it('does not default missing provider modes for an unknown environment', () => {
    expect(() =>
      getProviderConfiguration({ NODE_ENV: 'staging' }),
    ).toThrow(
      'GOOGLE_MAPS_MODE must be explicitly set outside development and test',
    );
  });

  it.each([undefined, 'staging'])(
    'accepts explicit live providers when NODE_ENV is %s',
    (nodeEnv) => {
      expect(
        getProviderConfiguration({
          ...(nodeEnv ? { NODE_ENV: nodeEnv } : {}),
          ...liveMaps,
          ...liveRazorpay,
        }),
      ).toMatchObject({
        nodeEnv: nodeEnv ?? 'unspecified',
        maps: { mode: 'live', configured: true },
        payments: { mode: 'live', configured: true },
      });
    },
  );

  it('rejects an invalid Maps mode', () => {
    expect(() =>
      getProviderConfiguration({
        NODE_ENV: 'development',
        GOOGLE_MAPS_MODE: 'automatic',
      }),
    ).toThrow('GOOGLE_MAPS_MODE must be either mock or live');
  });

  it('allows Maps mock mode without provider credentials', () => {
    expect(
      getProviderConfiguration({
        NODE_ENV: 'development',
        GOOGLE_MAPS_MODE: 'mock',
        RAZORPAY_MODE: 'mock',
      }).maps,
    ).toEqual({
      mode: 'mock',
      serverKey: undefined,
      configured: true,
    });
  });

  it('requires a Google server key whenever Maps mode is live', () => {
    expect(() =>
      getProviderConfiguration({
        NODE_ENV: 'development',
        GOOGLE_MAPS_MODE: 'live',
        RAZORPAY_MODE: 'mock',
      }),
    ).toThrow('Google Maps live mode requires GOOGLE_MAPS_SERVER_KEY');
  });

  it('accepts complete live Maps configuration', () => {
    expect(
      getProviderConfiguration({
        NODE_ENV: 'development',
        RAZORPAY_MODE: 'mock',
        ...liveMaps,
      }).maps,
    ).toMatchObject({ mode: 'live', configured: true });
  });

  it.each([
    ['GOOGLE_MAPS_SERVER_KEY', 'REPLACE_ME'],
    ['GOOGLE_MAPS_SERVER_KEY', 'maps-CHANGE_ME'],
    ['RAZORPAY_KEY_ID', '<required>'],
    ['RAZORPAY_KEY_ID', 'rzp_test_REPLACE_ME'],
    ['RAZORPAY_KEY_SECRET', 'CHANGE_ME'],
    ['RAZORPAY_WEBHOOK_SECRET', 'your_secret_here'],
  ])(
    'rejects a placeholder value for %s without exposing it',
    (variableName, placeholder) => {
      const environment: Record<string, string> = {
        NODE_ENV: 'development',
        ...liveMaps,
        ...liveRazorpay,
        [variableName]: placeholder,
      };

      let message = '';
      try {
        getProviderConfiguration(environment);
      } catch (error) {
        message = (error as Error).message;
      }

      expect(message).toContain(variableName);
      expect(message).not.toContain(placeholder);
    },
  );

  it('requires explicit provider modes in production', () => {
    expect(() =>
      getProviderConfiguration({ NODE_ENV: 'production' }),
    ).toThrow('GOOGLE_MAPS_MODE must be explicitly set to live in production');
    expect(() =>
      getProviderConfiguration({
        NODE_ENV: 'production',
        ...liveMaps,
      }),
    ).toThrow('RAZORPAY_MODE must be explicitly set to live in production');
  });

  it('forbids Google Maps mock mode in production', () => {
    expect(() =>
      getProviderConfiguration({
        NODE_ENV: 'production',
        GOOGLE_MAPS_MODE: 'mock',
        ...liveRazorpay,
      }),
    ).toThrow('GOOGLE_MAPS_MODE=mock is forbidden in production');
  });

  it('forbids Razorpay mock mode in production', () => {
    expect(() =>
      getProviderConfiguration({
        NODE_ENV: 'production',
        ...liveMaps,
        RAZORPAY_MODE: 'mock',
      }),
    ).toThrow('RAZORPAY_MODE=mock is forbidden in production');
  });

  it.each([
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
    'RAZORPAY_WEBHOOK_SECRET',
  ])('requires %s whenever Razorpay mode is live', (missingVariable) => {
    const environment: Record<string, string> = {
      NODE_ENV: 'development',
      GOOGLE_MAPS_MODE: 'mock',
      ...liveRazorpay,
    };
    delete environment[missingVariable];

    expect(() => getProviderConfiguration(environment)).toThrow(
      `Razorpay live mode requires ${missingVariable}`,
    );
  });

  it('accepts complete production provider configuration', () => {
    expect(
      getProviderConfiguration({
        NODE_ENV: 'production',
        ...liveMaps,
        ...liveRazorpay,
      }),
    ).toMatchObject({
      maps: { mode: 'live', configured: true },
      payments: { mode: 'live', configured: true },
    });
  });
});
