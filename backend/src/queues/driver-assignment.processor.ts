import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { LogisticsService } from '../modules/logistics/logistics.service';

@Processor('driver-assignment')
export class DriverAssignmentProcessor extends WorkerHost {
  constructor(private readonly logistics: LogisticsService) { super(); }

  async process(job: Job<{orderId:string;assignmentType:'pickup'|'delivery'}>) {
    return this.logistics.assignBestDriver(job.data.orderId, job.data.assignmentType);
  }
}
