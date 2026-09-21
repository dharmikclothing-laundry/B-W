import {BadRequestException, ForbiddenException} from '@nestjs/common';
import {QrAccessGuard} from './qr-access.guard';

function fixture(role: string, facilityId = 'facility-1', method = 'GET') {
  const request: any = {method, params: {orderId: 'order-1'}, body: {token: 'BW1:11111111-1111-4111-8111-111111111111', action: 'lookup'},
    user: {id: 'actor-1', roles: [role]}};
  const context: any = {switchToHttp: () => ({getRequest: () => request})};
  const from = jest.fn((table: string) => {
    const query: any = {};
    for (const name of ['select', 'eq', 'in', 'limit']) query[name] = jest.fn(() => query);
    query.maybeSingle = jest.fn(async () => ({data: table === 'order_qr_codes' ? {order_id: 'order-1', is_active: true}
      : table === 'orders' ? {id: 'order-1', facility_id: 'facility-1', customers: {profile_id: 'customer-1'}}
      : table === 'facility_employees' ? {facility_id: facilityId}
      : table === 'drivers' ? {id: 'driver-1', is_active: true}
      : table === 'driver_assignments' ? {id: 'assignment-1'} : null, error: null}));
    return query;
  });
  return {guard: new QrAccessGuard({admin: {from}} as any), request, context, from};
}

describe('Legacy QR HTTP authorization', () => {
  it('lets a customer read only their own stable order QR', async () => {
    const own = fixture('customer'); own.request.user.id = 'customer-1';
    await expect(own.guard.canActivate(own.context)).resolves.toBe(true);
    const other = fixture('customer');
    await expect(other.guard.canActivate(other.context)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('scopes Staff QR reads and scans to their assigned facility', async () => {
    const own = fixture('facility_employee', 'facility-1', 'POST');
    await expect(own.guard.canActivate(own.context)).resolves.toBe(true);
    expect(own.request.body.token).toBe('11111111-1111-4111-8111-111111111111');
    const wrong = fixture('manager', 'facility-2', 'POST');
    await expect(wrong.guard.canActivate(wrong.context)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('allows an assigned Driver and blocks a Customer scan', async () => {
    const driver = fixture('driver');
    await expect(driver.guard.canActivate(driver.context)).resolves.toBe(true);
    const customer = fixture('customer', 'facility-1', 'POST'); customer.request.user.id = 'customer-1';
    await expect(customer.guard.canActivate(customer.context)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('never lets legacy lookup impersonate an atomic Facility receipt', async () => {
    const f = fixture('facility_employee', 'facility-1', 'POST'); f.request.body.action = 'facility_received';
    await expect(f.guard.canActivate(f.context)).rejects.toBeInstanceOf(BadRequestException);
    expect(f.from).not.toHaveBeenCalled();
  });
});
