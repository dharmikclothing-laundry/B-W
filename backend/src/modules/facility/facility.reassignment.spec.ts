import {ForbiddenException} from '@nestjs/common';
import {FacilityService} from './facility.service';

const orderId = '00000000-0000-4000-8000-000000000001';
const oldDriverId = '00000000-0000-4000-8000-000000000002';
const newDriverId = '00000000-0000-4000-8000-000000000003';

function fixture(orderFacility = 'facility-1') {
  const rows: Record<string, any> = {
    facility_employees: {facility_id: 'facility-1', employee_role: 'facility_employee'},
    facilities: {id: 'facility-1', name: 'Banjara Hills Care Centre', address: 'Banjara Hills', is_active: true},
    orders: {id: orderId, facility_id: orderFacility, current_status: 'delivery_failed'},
    driver_assignments: [{driver_id: oldDriverId, status: 'rejected'}],
    drivers: [{id: newDriverId, profile_id: 'profile-3', is_active: true,
      is_available: true, max_concurrent_jobs: 3}],
    profiles: [{id: 'profile-3', full_name: 'Meera Shah'}],
  };
  const from = jest.fn((table: string) => {
    const query: any = {};
    for (const method of ['select', 'eq', 'in', 'order', 'limit']) {
      query[method] = jest.fn(() => query);
    }
    query.maybeSingle = jest.fn(async () => ({data: rows[table] ?? null, error: null}));
    query.then = (resolve: any) => Promise.resolve({
      data: Array.isArray(rows[table]) ? rows[table] : [], error: null,
    }).then(resolve);
    return query;
  });
  const rpc = jest.fn(async (name: string) => name === 'find_driver_assignment_candidates'
    ? {data: [
      {driver_id: oldDriverId, active_workload: 0},
      {driver_id: newDriverId, active_workload: 1},
    ], error: null}
    : {data: {assignment: {id: 'replacement'}}, error: null});
  return {service: new FacilityService({admin: {from, rpc}} as any), rpc};
}

describe('Facility delivery reassignment', () => {
  it('lists a different eligible Driver after rejection', async () => {
    const f = fixture();
    await expect(f.service.availableDeliveryDrivers('staff-1', orderId)).resolves.toEqual({
      drivers: [{id: newDriverId, name: 'Meera Shah', activeJobs: 1}],
    });
    expect(f.rpc).toHaveBeenCalledWith('find_driver_assignment_candidates', {
      p_order_id: orderId, p_assignment_type: 'delivery', p_limit: 50,
    });
  });

  it('passes the active Facility Staff identity into the atomic reassignment', async () => {
    const f = fixture();
    await expect(f.service.reassignDelivery('staff-1', orderId, newDriverId))
      .resolves.toEqual({assignment: {id: 'replacement'}});
    expect(f.rpc).toHaveBeenCalledWith('facility_reassign_delivery_atomic', {
      p_profile_id: 'staff-1', p_order_id: orderId, p_new_driver_id: newDriverId,
    });
  });

  it('blocks a Facility employee from reassigning another Facility order', async () => {
    const f = fixture('facility-2');
    await expect(f.service.reassignDelivery('staff-1', orderId, newDriverId))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(f.rpc).not.toHaveBeenCalled();
  });
});
