import {ForbiddenException} from '@nestjs/common';
import {FacilityService} from './facility.service';

function fixture(role = 'facility_employee', facilityId = 'facility-1') {
  const calls: Array<{table: string; method: string; value?: unknown; second?: unknown}> = [];
  const from = jest.fn((table: string) => {
    const query: any = {};
    for (const method of ['select', 'eq', 'not', 'order', 'update', 'limit']) query[method] = jest.fn((value?: unknown, second?: unknown) => {
      calls.push({table, method, value, second}); return query;
    });
    query.maybeSingle = jest.fn(async () => ({data: table === 'facility_employees'
      ? {facility_id: facilityId, employee_role: role}
      : table === 'facilities' ? {id: facilityId, name: 'Local Facility', is_active: true}
      : table === 'orders' ? {id: 'order-1', facility_id: 'facility-1', current_status: 'received_at_facility'}
      : table === 'facility_intake_discrepancies' ? {id: 'disc-1', status: 'resolved'} : null, error: null}));
    query.then = (resolve: any) => Promise.resolve({data: [], error: null}).then(resolve);
    return query;
  });
  const rpc = jest.fn(async () => ({data: {operationId: 'operation-1', orderStatus: 'verification', discrepancyCount: 2}, error: null}));
  return {service: new FacilityService({admin: {from, rpc}} as any), calls, rpc, from};
}

test('submits per-item measurements only to the existing-lifecycle atomic intake procedure', async () => {
  const f = fixture();
  const body = {items: [{orderItemId: 'item-1', countedQuantity: 1, weightKg: 2, damaged: true, notes: 'Fictional mismatch'}], notes: 'Intake checked'};
  await expect(f.service.verifyIntake('staff-1', 'order-1', body)).resolves.toEqual({
    orderId: 'order-1', operationId: 'operation-1', verified: true, orderStatus: 'verification', discrepancyCount: 2,
  });
  expect(f.rpc).toHaveBeenCalledWith('record_facility_intake_verification_atomic', {
    p_order_id: 'order-1', p_performed_by: 'staff-1', p_items: body.items, p_notes: body.notes,
  });
  expect(f.from).not.toHaveBeenCalledWith('order_items');
});

test('blocks another Facility and Staff resolution before any discrepancy write', async () => {
  const wrong = fixture('facility_employee', 'facility-2');
  await expect(wrong.service.verifyIntake('staff-1', 'order-1', {items: [], notes: ''})).rejects.toBeInstanceOf(ForbiddenException);
  expect(wrong.rpc).not.toHaveBeenCalled();
  const staff = fixture();
  await expect(staff.service.resolveIntakeDiscrepancy('staff-1', 'order-1', 'disc-1', 'Resolved')).rejects.toBeInstanceOf(ForbiddenException);
  expect(staff.calls.some(call => call.table === 'facility_intake_discrepancies' && call.method === 'update')).toBe(false);
});

test('Manager resolves only an open discrepancy on the assigned order with audit fields', async () => {
  const f = fixture('manager');
  await f.service.resolveIntakeDiscrepancy('manager-1', 'order-1', 'disc-1', 'Reconciled');
  const updates = f.calls.filter(call => call.table === 'facility_intake_discrepancies' && call.method === 'update');
  expect(updates[0].value).toEqual(expect.objectContaining({status: 'resolved', resolved_by: 'manager-1', resolution_notes: 'Reconciled'}));
  expect(f.calls).toContainEqual({table: 'facility_intake_discrepancies', method: 'eq', value: 'status', second: 'open'});
});
