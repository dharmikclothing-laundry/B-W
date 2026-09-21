import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

@Module({
  imports: [SupabaseModule, RbacModule],
  controllers: [StaffController],
  providers: [StaffService],
})
export class StaffModule {}
