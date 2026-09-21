export type ProviderMode = 'mock' | 'live';

type Environment = Record<string, unknown>;

export type ProviderConfiguration = {
  nodeEnv: string;
  maps: {
    mode: ProviderMode;
    serverKey?: string;
    configured: boolean;
  };
  payments: {
    mode: ProviderMode;
    keyId?: string;
    keySecret?: string;
    webhookSecret?: string;
    configured: boolean;
  };
};

function value(environment: Environment, name: string) {
  const raw = environment[name];
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
}

const credentialPlaceholders = new Set([
  'replace_me',
  'replaceme',
  'change_me',
  'changeme',
  'placeholder',
  'your_key_here',
  'your_secret_here',
]);
const delimitedCredentialPlaceholder =
  /(?:^|[-./:_])(?:replace_me|replaceme|change_me|changeme|placeholder|your_key_here|your_secret_here)(?:$|[-./:_])/;

function credentialValue(environment: Environment, name: string) {
  const configured = value(environment, name);

  if (!configured) {
    return undefined;
  }

  const normalized = configured.toLowerCase();
  if (
    credentialPlaceholders.has(normalized) ||
    delimitedCredentialPlaceholder.test(normalized) ||
    (normalized.startsWith('<') && normalized.endsWith('>'))
  ) {
    return undefined;
  }

  return configured;
}

function mode(
  environment: Environment,
  name: 'GOOGLE_MAPS_MODE' | 'RAZORPAY_MODE',
  nodeEnv: string,
): ProviderMode {
  const configured = value(environment, name);

  if (!configured) {
    if (nodeEnv === 'development' || nodeEnv === 'test') {
      return 'mock';
    }

    if (nodeEnv === 'production') {
      throw new Error(`${name} must be explicitly set to live in production`);
    }

    throw new Error(
      `${name} must be explicitly set outside development and test`,
    );
  }

  if (configured !== 'mock' && configured !== 'live') {
    throw new Error(`${name} must be either mock or live`);
  }

  if (nodeEnv === 'production' && configured === 'mock') {
    throw new Error(`${name}=mock is forbidden in production`);
  }

  return configured;
}

function requireVariables(
  environment: Environment,
  names: string[],
  provider: string,
) {
  const missing = names.filter((name) => !credentialValue(environment, name));

  if (missing.length) {
    throw new Error(
      `${provider} live mode requires ${missing.join(', ')}`,
    );
  }
}

export function getProviderConfiguration(
  environment: Environment = process.env,
): ProviderConfiguration {
  const nodeEnv = value(environment, 'NODE_ENV') ?? 'unspecified';
  const mapsMode = mode(environment, 'GOOGLE_MAPS_MODE', nodeEnv);
  const paymentsMode = mode(environment, 'RAZORPAY_MODE', nodeEnv);

  if (mapsMode === 'live') {
    requireVariables(environment, ['GOOGLE_MAPS_SERVER_KEY'], 'Google Maps');
  }

  if (paymentsMode === 'live') {
    requireVariables(
      environment,
      [
        'RAZORPAY_KEY_ID',
        'RAZORPAY_KEY_SECRET',
        'RAZORPAY_WEBHOOK_SECRET',
      ],
      'Razorpay',
    );
  }

  return {
    nodeEnv,
    maps: {
      mode: mapsMode,
      serverKey: credentialValue(environment, 'GOOGLE_MAPS_SERVER_KEY'),
      configured:
        mapsMode === 'mock' ||
        Boolean(credentialValue(environment, 'GOOGLE_MAPS_SERVER_KEY')),
    },
    payments: {
      mode: paymentsMode,
      keyId: credentialValue(environment, 'RAZORPAY_KEY_ID'),
      keySecret: credentialValue(environment, 'RAZORPAY_KEY_SECRET'),
      webhookSecret: credentialValue(environment, 'RAZORPAY_WEBHOOK_SECRET'),
      configured:
        paymentsMode === 'mock' ||
        Boolean(
          credentialValue(environment, 'RAZORPAY_KEY_ID') &&
            credentialValue(environment, 'RAZORPAY_KEY_SECRET') &&
            credentialValue(environment, 'RAZORPAY_WEBHOOK_SECRET'),
        ),
    },
  };
}

export function validateProviderConfiguration(environment: Environment) {
  const providers = getProviderConfiguration(environment);

  return {
    ...environment,
    GOOGLE_MAPS_MODE: providers.maps.mode,
    RAZORPAY_MODE: providers.payments.mode,
  };
}
