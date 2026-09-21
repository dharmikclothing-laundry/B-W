import { Module } from '@nestjs/common';
import { LogisticsService } from './logistics.service';
import { LogisticsController } from './logistics.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { MapsModule } from '../maps/maps.module';

@Module({
  imports: [SupabaseModule, MapsModule],
  providers: [LogisticsService],
  controllers: [LogisticsController],
  exports: [LogisticsService],
})
export class LogisticsModule {}
