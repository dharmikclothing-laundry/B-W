import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { ClaimsController } from './claims.controller';
import { ClaimsService } from './claims.service';

@Module({
  imports: [SupabaseModule],
  controllers: [ClaimsController],
  providers: [ClaimsService],
})
export class ClaimsModule {}
