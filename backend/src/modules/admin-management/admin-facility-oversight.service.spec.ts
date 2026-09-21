import {NotFoundException} from '@nestjs/common';
import {AdminFacilityOversightService} from './admin-facility-oversight.service';

const a = '00000000-0000-4000-8000-000000000001';
const b = '00000000-0000-4000-8000-000000000002';
const old = new Date(Date.now() - 25 * 3600000).toISOString();
const data: Record<string, any[]> = {
  facilities: [{id: a, name: 'A Facility', is_active: true}, {id: b, name: 'B Facility', is_active: true}],
  orders: [{id: 'order-a', order_number: 'BW-A', facility_id: a, current_status: 'processing', created_at: old, updated_at: old},
    {id: 'order-b', order_number: 'BW-B', facility_id: b, current_status: 'ready_for_delivery', created_at: old, updated_at: old}],
  facility_order_operations: [{id: 'op-a', order_id: 'order-a', facility_id: a, operation_type: 'washing', status: 'started',
    started_at: old, rewash_cycle: 0}],
  facility_intake_discrepancies: [{id: 'dis-a', order_id: 'order-a', status: 'open', kind: 'missing', notes: 'Missing item'}],
  facility_qc_decisions: [{id: 'qc-b', order_id: 'order-b', approved: false, cycle_number: 0}],
  facility_packings: [], facility_employees: [{id: 'employee-a', facility_id: a, profile_id: 'staff-a', is_active: true}],
  profiles: [{id: 'staff-a', is_active: true}], facility_machines: [{id: 'machine-a', facility_id: a, status: 'active', capacity_kg: 10}],
  garment_inspections: [], order_status_history: [], order_qr_codes: [{id: 'qr-a', order_id: 'order-a', is_active: true}],
  qr_scan_logs: [{id: 'scan-a', qr_code_id: 'qr-a', scan_action: 'facility_intake', scanned_at: old}],
};
const fixture = () => {
  const from = jest.fn((table: string) => {
    const filters: Array<{column: string; value: string}> = [];
    const query: any = {select: () => query, eq: (column: string, value: string) => {filters.push({column, value}); return query;},
      maybeSingle: async () => ({data: data[table]?.find(row => filters.every(filter => row[filter.column] === filter.value)) ?? null, error: null}),
      range: async () => ({data: (data[table] ?? []).filter(row => filters.every(filter => row[filter.column] === filter.value)), error: null})};
    return query;
  });
  return {service: new AdminFacilityOversightService({admin: {from}} as any), from};
};

describe('9H Admin Facility oversight', () => {
  it('aggregates cross-Facility workload, discrepancy, stage, age, staff, and installed capacity without writes', async () => {
    const {service, from} = fixture();
    const result = await service.list();
    expect(result.facilities[0]).toMatchObject({id: a, workload: 1, openDiscrepancies: 1,
      stages: {washing: 1}, stuckOrders: 1, activeStaff: 1, installedMachineCapacityKg: 10});
    expect(result.facilities[1]).toMatchObject({id: b, workload: 1, ready: 1, qcFailures: 1});
    expect(result.monitoring.contractualSla).toBe(false);
    expect(from).toHaveBeenCalledWith('facility_order_operations');
  });

  it('limits Facility drill-down to the selected Facility', async () => {
    const {service} = fixture();
    expect((await service.facility(a)).orders.map(row => row.id)).toEqual(['order-a']);
    await expect(service.facility('missing')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.order(a, 'order-b')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns QR scan audit without exposing the secure QR token', async () => {
    const {service} = fixture();
    const result = await service.order(a, 'order-a');
    expect(result.qr[0].scans[0].scan_action).toBe('facility_intake');
    expect(JSON.stringify(result)).not.toContain('secure_token');
    expect(result.operations).toHaveLength(1);
  });
});
