import { Test } from '@nestjs/testing';
import { MapsModule } from './maps.module';
import { MapsService } from './maps.service';

describe('MapsModule provider selection', () => {
  const originalEnvironment = {
    nodeEnv: process.env.NODE_ENV,
    mapsMode: process.env.GOOGLE_MAPS_MODE,
    mapsKey: process.env.GOOGLE_MAPS_SERVER_KEY,
    razorpayMode: process.env.RAZORPAY_MODE,
  };
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;

    const restore = (name: string, value: string | undefined) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };

    restore('NODE_ENV', originalEnvironment.nodeEnv);
    restore('GOOGLE_MAPS_MODE', originalEnvironment.mapsMode);
    restore('GOOGLE_MAPS_SERVER_KEY', originalEnvironment.mapsKey);
    restore('RAZORPAY_MODE', originalEnvironment.razorpayMode);
  });

  it('selects the mock provider without requiring a Google key', async () => {
    process.env.NODE_ENV = 'test';
    process.env.GOOGLE_MAPS_MODE = 'mock';
    process.env.RAZORPAY_MODE = 'mock';
    delete process.env.GOOGLE_MAPS_SERVER_KEY;
    global.fetch = jest.fn();

    const module = await Test.createTestingModule({
      imports: [MapsModule],
    }).compile();
    const service = module.get(MapsService);

    await expect(
      service.getRoute(
        { latitude: 17.4401, longitude: 78.3489 },
        { latitude: 17.385, longitude: 78.4867 },
      ),
    ).resolves.toMatchObject({ provider: 'mock' });
    expect(service.providerName).toBe('mock');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
