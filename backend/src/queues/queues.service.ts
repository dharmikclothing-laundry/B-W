import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

@Injectable()
export class QueueService implements OnModuleDestroy {
  readonly redis: IORedis;
  readonly notifications: Queue;
  readonly driverAssignment: Queue;

  constructor() {
    const options = { maxRetriesPerRequest: null };
    this.redis = process.env.REDIS_URL
      ? new IORedis(process.env.REDIS_URL, options)
      : new IORedis({ ...options, host: process.env.REDIS_HOST || 'localhost', port: Number(process.env.REDIS_PORT || 6379) });
    this.notifications = new Queue('notifications', { connection: this.redis });
    this.driverAssignment = new Queue('driver-assignment', { connection: this.redis });
  }

  async enqueueNotification(data: unknown) {
    return this.notifications.add('send', data);
  }

  async enqueueAssignment(data: unknown) {
    return this.driverAssignment.add('assign', data);
  }

  async onModuleDestroy() {
    await Promise.all([this.notifications.close(), this.driverAssignment.close()]);
    this.redis.disconnect();
  }
}
