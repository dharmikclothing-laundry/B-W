import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

const ADMIN_VIEWS = [
  'admin_revenue_analytics',
  'admin_order_analytics',
  'admin_driver_performance',
  'admin_facility_performance',
  'admin_machine_utilization',
] as const;

@Injectable()
export class AnalyticsService {
  constructor(private readonly supabase: SupabaseService) {}

  async dashboard() {
    return Promise.all(ADMIN_VIEWS.map(async view => {
      const { data, error } = await this.supabase.admin.from(view).select('*');
      if (error) throw new ServiceUnavailableException('Admin dashboard unavailable');
      return { view, data: data ?? [] };
    }));
  }
}
