import { Global,Module } from '@nestjs/common'; import { QueueService } from './queues.service'; @Global() @Module({providers:[QueueService],exports:[QueueService]}) export class QueuesModule{}
