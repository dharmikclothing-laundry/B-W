import { Module } from "@nestjs/common";
import { SupabaseModule } from "../supabase/supabase.module";
import { LogisticsModule } from "../logistics/logistics.module";
import { FacilityService } from "./facility.service";
import { FacilityController } from "./facility.controller";

@Module({
  imports: [SupabaseModule, LogisticsModule],
  providers: [FacilityService],
  controllers: [FacilityController],
})
export class FacilityModule {}
