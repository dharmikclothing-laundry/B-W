import { ServiceUnavailableException } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

describe('Admin analytics dashboard', () => {
  const from = jest.fn();
  const service = new AnalyticsService({ admin: { from } } as any);

  beforeEach(() => from.mockReset());

  it('returns all five existing analytics views, including empty data', async () => {
    from.mockImplementation(() => ({ select: async () => ({ data: [], error: null }) }));
    const result = await service.dashboard();
    expect(result.map(item => item.view)).toEqual([
      'admin_revenue_analytics', 'admin_order_analytics',
      'admin_driver_performance', 'admin_facility_performance',
      'admin_machine_utilization',
    ]);
    expect(result.every(item => item.data.length === 0)).toBe(true);
  });

  it('fails closed without exposing provider details if a view is unavailable', async () => {
    from.mockImplementation((view: string) => ({ select: async () => ({
      data: null, error: view === 'admin_order_analytics' ? {message: 'internal database detail'} : null,
    }) }));
    await expect(service.dashboard()).rejects.toThrow(ServiceUnavailableException);
    await expect(service.dashboard()).rejects.toThrow('Admin dashboard unavailable');
  });
});
