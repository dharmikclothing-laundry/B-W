import { ProductionService } from './production.service';

describe('ProductionService provider diagnostics', () => {
  const originalEnvironment = {
    NODE_ENV: process.env.NODE_ENV,
    GOOGLE_MAPS_MODE: process.env.GOOGLE_MAPS_MODE,
    RAZORPAY_MODE: process.env.RAZORPAY_MODE,
  };

  afterEach(() => {
    for (const [name, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  it('returns only safe provider state', () => {
    process.env.NODE_ENV = 'development';
    process.env.GOOGLE_MAPS_MODE = 'mock';
    process.env.RAZORPAY_MODE = 'mock';
    const service = new ProductionService({} as any, {} as any);

    const diagnostics = service.providerDiagnostics();

    expect(diagnostics).toEqual({
      nodeEnv: 'development',
      maps: { mode: 'mock', configured: true },
      payments: { mode: 'mock', configured: true },
    });
    expect(JSON.stringify(diagnostics)).not.toMatch(
      /key|secret|credential/i,
    );
  });
});
