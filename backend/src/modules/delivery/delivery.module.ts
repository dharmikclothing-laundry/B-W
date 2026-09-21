import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { LogisticsModule } from '../logistics/logistics.module';
import { DeliveryService } from './delivery.service';
import { DeliveryController } from './delivery.controller';

@Module({
  imports: [SupabaseModule, LogisticsModule],
  providers: [DeliveryService],
  controllers: [DeliveryController],
})
export class DeliveryModule {}
