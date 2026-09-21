import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import { QueueService } from './queues.service';

jest.mock('ioredis', () => jest.fn().mockImplementation(() => ({ disconnect: jest.fn() })));
jest.mock('bullmq', () => ({ Queue: jest.fn().mockImplementation(() => ({ add: jest.fn(), close: jest.fn().mockResolvedValue(undefined) })) }));

describe('QueueService', () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    for (const key of ['REDIS_URL', 'REDIS_HOST', 'REDIS_PORT']) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
    jest.clearAllMocks();
  });

  it('uses REDIS_URL and closes both queues before disconnecting', async () => {
    process.env.REDIS_URL = 'redis://127.0.0.1:16379';
    const service = new QueueService();
    expect(IORedis).toHaveBeenCalledWith(process.env.REDIS_URL, { maxRetriesPerRequest: null });
    expect(Queue).toHaveBeenCalledWith('notifications', { connection: service.redis });
    await service.onModuleDestroy();
    expect(service.notifications.close).toHaveBeenCalledTimes(1);
    expect(service.driverAssignment.close).toHaveBeenCalledTimes(1);
    expect(service.redis.disconnect).toHaveBeenCalledTimes(1);
  });

  it('preserves host/port configuration when REDIS_URL is absent', () => {
    delete process.env.REDIS_URL;
    process.env.REDIS_HOST = '127.0.0.1';
    process.env.REDIS_PORT = '16379';
    new QueueService();
    expect(IORedis).toHaveBeenCalledWith({ host: '127.0.0.1', port: 16379, maxRetriesPerRequest: null });
  });
});
