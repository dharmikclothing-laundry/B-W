import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { FacilityService } from './facility.service';
import { FacilityController } from './facility.controller';

@Module({
  imports: [SupabaseModule],
  providers: [FacilityService],
  controllers: [FacilityController],
})
export class FacilityModule {}
