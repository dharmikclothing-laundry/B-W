import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';

@Injectable()
export class DistributedLockService implements OnModuleDestroy {
  private readonly redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  async acquire(key: string, ttlMs = 30_000) {
    const token = randomUUID();
    const ok = await this.redis.set(`lock:${key}`, token, 'PX', ttlMs, 'NX');
    return ok ? { key, token } : null;
  }
  async release(lock: { key: string; token: string }) {
    const script = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
    await this.redis.eval(script, 1, `lock:${lock.key}`, lock.token);
  }
  async onModuleDestroy(){ await this.redis.quit(); }
}
