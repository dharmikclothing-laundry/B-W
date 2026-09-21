import {Module} from '@nestjs/common';
import {SupabaseModule} from '../supabase/supabase.module';
import {AnalyticsService} from './analytics.service';
import {AnalyticsController} from './analytics.controller';
import {AnalyticsReportsService} from './analytics-reports.service';
import {AnalyticsReportsController} from './analytics-reports.controller';

@Module({imports: [SupabaseModule], providers: [AnalyticsService, AnalyticsReportsService],
  controllers: [AnalyticsController, AnalyticsReportsController]})
export class AnalyticsModule {}
