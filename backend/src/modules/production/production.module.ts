import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { ProductionService } from './production.service';
import { ProductionController } from './production.controller';
import { ProviderDiagnosticsController } from './provider-diagnostics.controller';
@Module({ imports:[SupabaseModule], providers:[ProductionService], controllers:[ProductionController, ProviderDiagnosticsController], exports:[ProductionService] })
export class ProductionModule {}
