import {apiRequest} from './api';

type AnalyticsView = {view: string; data: unknown[]};
type RevenueRow = {gross_revenue?: number | string};
type OrderRow = {current_status?: string; order_count?: number | string};
type DriverRow = {is_active?: boolean};
type FacilityRow = {is_active?: boolean; active_processing_orders?: number | string; ready_for_delivery_orders?: number | string};

export type AdminDashboard = {
  totalOrders: number;
  activeOrders: number;
  cancelledOrders: number;
  grossRevenue: number;
  activeDrivers: number;
  activeFacilities: number;
  processingOrders: number;
  readyOrders: number;
  ordersByStatus: Array<{status: string; count: number}>;
};

const count = (value: number | string | undefined) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

function rows<T>(views: AnalyticsView[], name: string): T[] {
  const view = views.find(item => item.view === name);
  if (!view || !Array.isArray(view.data)) throw new Error('Admin dashboard data is incomplete.');
  return view.data as T[];
}

export function summarizeAdminAnalytics(views: AnalyticsView[]): AdminDashboard {
  const revenue = rows<RevenueRow>(views, 'admin_revenue_analytics');
  const orders = rows<OrderRow>(views, 'admin_order_analytics');
  const drivers = rows<DriverRow>(views, 'admin_driver_performance');
  const facilities = rows<FacilityRow>(views, 'admin_facility_performance');
  rows(views, 'admin_machine_utilization');
  const ordersByStatus = orders.map(row => ({status: row.current_status || 'unknown', count: count(row.order_count)}));
  const inactive = new Set(['draft', 'cancelled', 'completed', 'delivered']);
  return {
    totalOrders: ordersByStatus.reduce((sum, row) => sum + row.count, 0),
    activeOrders: ordersByStatus.filter(row => !inactive.has(row.status)).reduce((sum, row) => sum + row.count, 0),
    cancelledOrders: ordersByStatus.find(row => row.status === 'cancelled')?.count ?? 0,
    grossRevenue: revenue.reduce((sum, row) => sum + count(row.gross_revenue), 0),
    activeDrivers: drivers.filter(row => row.is_active).length,
    activeFacilities: facilities.filter(row => row.is_active).length,
    processingOrders: facilities.reduce((sum, row) => sum + count(row.active_processing_orders), 0),
    readyOrders: facilities.reduce((sum, row) => sum + count(row.ready_for_delivery_orders), 0),
    ordersByStatus,
  };
}

export async function getAdminDashboard(accessToken: string): Promise<AdminDashboard> {
  const views = await apiRequest<AnalyticsView[]>('/admin/analytics/dashboard', {accessToken});
  if (!Array.isArray(views)) throw new Error('Admin dashboard data is incomplete.');
  return summarizeAdminAnalytics(views);
}
