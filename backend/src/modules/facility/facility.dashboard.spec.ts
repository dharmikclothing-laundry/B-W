import { ForbiddenException } from '@nestjs/common';
import { FacilityService } from './facility.service';

function fixture(employeeActive = true, facilityActive = true,
  orders = [
    {id: 'order-1', order_number: 'BW-1', current_status: 'in_transit_to_facility'},
    {id: 'order-2', order_number: 'BW-2', current_status: 'processing'},
  ], assignments: any[] = []) {
  const queries: Record<string, any> = {};
  const from = jest.fn((table: string) => {
    const query: any = {};
    for (const method of ['select', 'eq', 'in', 'order', 'limit']) query[method] = jest.fn(() => query);
    query.maybeSingle = jest.fn(async () => ({data: table === 'facility_employees'
      ? employeeActive ? {facility_id: 'facility-1', employee_role: 'manager'} : null
      : facilityActive ? {id: 'facility-1', name: 'Local Facility', address: 'Test Lane', is_active: true} : null,
    error: null}));
    query.then = (resolve: any) => Promise.resolve({
      data: table === 'orders' ? orders : table === 'driver_assignments' ? assignments : [],
      error: null,
    }).then(resolve);
    queries[table] = query;
    return query;
  });

  return {service: new FacilityService({admin: {from}} as any), from, queries};
}

describe('Facility dashboard authorization', () => {
  it('shows only assigned-facility queue and counts from server data', async () => {
    const f = fixture();
    const dashboard = await f.service.dashboard('staff-1');
    expect(f.queries.facility_employees.eq).toHaveBeenCalledWith('profile_id', 'staff-1');
    expect(f.queries.orders.eq).toHaveBeenCalledWith('facility_id', 'facility-1');
    expect(dashboard.facility).toEqual({id: 'facility-1', name: 'Local Facility', address: 'Test Lane'});
    expect(dashboard.summary).toEqual({incoming: 1, received: 0, processing: 1, ready: 0});
    expect(dashboard.orders).toHaveLength(2);
  });

  it.each([[false, true], [true, false]])('blocks inactive employee/facility', async (employee, facility) => {
    const f = fixture(employee, facility);
    await expect(f.service.dashboard('staff-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.from).not.toHaveBeenCalledWith('orders');
  });

  it('keeps assigned and rejected deliveries in Ready until Driver acceptance', async () => {
    const orders = [
      {id: 'order-ready', order_number: 'BW-READY', current_status: 'ready_for_delivery'},
      {id: 'order-assigned', order_number: 'BW-ASSIGNED', current_status: 'delivery_assigned'},
      {id: 'order-rejected', order_number: 'BW-REJECTED', current_status: 'delivery_failed'},
    ];
    const assignments = [
      {id: 'a2', order_id: 'order-rejected', driver_id: 'driver-2', status: 'rejected',
        assigned_at: '2026-09-22T02:00:00Z', rejection_reason: 'Route unavailable'},
      {id: 'a1', order_id: 'order-assigned', driver_id: 'driver-1', status: 'assigned',
        assigned_at: '2026-09-22T01:00:00Z', rejection_reason: null},
    ];
    const f = fixture(true, true, orders, assignments);
    const dashboard = await f.service.dashboard('staff-1');
    expect(dashboard.summary.ready).toBe(3);
    expect(dashboard.orders.find(order => order.id === 'order-assigned')?.deliveryAssignment)
      .toMatchObject({id: 'a1', status: 'assigned'});
    expect(dashboard.orders.find(order => order.id === 'order-rejected')?.deliveryAssignment)
      .toMatchObject({id: 'a2', status: 'rejected', rejectionReason: 'Route unavailable'});
  });
});
