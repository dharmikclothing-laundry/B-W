import { Module } from '@nestjs/common';
import { LogisticsService } from './logistics.service';
import { LogisticsController } from './logistics.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { MapsModule } from '../maps/maps.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AssignmentSchedulerService } from './assignment-scheduler.service';

@Module({
  imports: [SupabaseModule, MapsModule, NotificationsModule],
  providers: [LogisticsService, AssignmentSchedulerService],
  controllers: [LogisticsController],
  exports: [LogisticsService],
})
export class LogisticsModule {}
