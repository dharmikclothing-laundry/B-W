import { Module } from "@nestjs/common";
import { SupabaseModule } from "../supabase/supabase.module";
import { ServicesController } from "./services.controller";
import { ServicesService } from "./services.service";

@Module({
  imports: [SupabaseModule],
  controllers: [ServicesController],
  providers: [ServicesService],
})
export class ServicesModule {}
