import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { SupabaseService } from '../modules/supabase/supabase.service';
import { DistributedLockService } from '../common/redis/distributed-lock.service';

@Injectable()
export class DriverReassignmentWorker implements OnModuleDestroy {
  private readonly logger = new Logger(DriverReassignmentWorker.name);
  private readonly redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  private readonly queue = new Queue('driver-reassignment', { connection: this.redis });
  private readonly worker = new Worker('driver-reassignment', async job => this.process(job.data), { connection: this.redis });

  constructor(private readonly supabase: SupabaseService, private readonly locks: DistributedLockService) {}

  async enqueue(assignmentId: string, reason: string, delay = 0) {
    await this.queue.add('reassign', { assignmentId, reason }, { delay, attempts: 5, backoff: { type: 'exponential', delay: 5000 } });
  }

  private async process(data: { assignmentId: string; reason: string }) {
    const lock = await this.locks.acquire(`assignment:${data.assignmentId}`, 45_000);
    if (!lock) return;
    try {
      const { data: assignment } = await this.supabase.admin.from('driver_assignments').select('*').eq('id', data.assignmentId).single();
      if (!assignment || ['completed','cancelled'].includes(assignment.status)) return;
      await this.supabase.admin.from('driver_assignments').update({ status: 'reassignment_required', rejection_reason: data.reason }).eq('id', assignment.id);
      // Calls the Phase 3 database/API assignment engine. The exact RPC name is kept configurable.
      const rpc = process.env.DRIVER_REASSIGN_RPC || 'auto_assign_nearest_driver';
      await this.supabase.admin.rpc(rpc, { p_order_id: assignment.order_id, p_assignment_type: assignment.assignment_type });
    } finally { await this.locks.release(lock); }
  }

  async onModuleDestroy(){ await this.worker.close(); await this.queue.close(); await this.redis.quit(); }
}
