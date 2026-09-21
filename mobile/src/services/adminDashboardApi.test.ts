import {getAdminDashboard, summarizeAdminAnalytics} from './adminDashboardApi';
import {apiRequest} from './api';

jest.mock('./api', () => ({apiRequest: jest.fn()}));
const request = apiRequest as jest.Mock;
const views = [
  {view: 'admin_revenue_analytics', data: [{gross_revenue: '125.50'}]},
  {view: 'admin_order_analytics', data: [{current_status: 'processing', order_count: 2},
    {current_status: 'delivered', order_count: 3}, {current_status: 'cancelled', order_count: 1}]},
  {view: 'admin_driver_performance', data: [{is_active: true}, {is_active: false}]},
  {view: 'admin_facility_performance', data: [{is_active: true, active_processing_orders: 2, ready_for_delivery_orders: 1}]},
  {view: 'admin_machine_utilization', data: []},
];

test('uses the existing role-protected Admin analytics endpoint and summarizes its views', async () => {
  request.mockResolvedValue(views);
  expect(await getAdminDashboard('admin-token')).toMatchObject({
    totalOrders: 6, activeOrders: 2, cancelledOrders: 1,
    grossRevenue: 125.5, activeDrivers: 1, activeFacilities: 1,
    processingOrders: 2, readyOrders: 1,
  });
  expect(request).toHaveBeenCalledWith('/admin/analytics/dashboard', {accessToken: 'admin-token'});
});

test('handles a genuinely empty Admin dashboard', () => {
  expect(summarizeAdminAnalytics(views.map(view => ({...view, data: []})))).toMatchObject({totalOrders: 0, grossRevenue: 0, ordersByStatus: []});
});

test('does not render partial analytics as a valid dashboard', () => {
  expect(() => summarizeAdminAnalytics(views.slice(0, 4))).toThrow('incomplete');
});
