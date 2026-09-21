import { ForbiddenException } from '@nestjs/common';
import { StaffService } from './staff.service';

function fixture(admin = true) {
  const calls: Array<{table: string; method: string; value?: unknown}> = [];
  let roleLookups = 0;
  const from = jest.fn((table: string) => {
    const query: any = {};
    for (const method of ['select', 'eq', 'insert', 'update', 'single', 'maybeSingle']) {
      query[method] = jest.fn((value?: unknown) => {
        calls.push({table, method, value});
        return query;
      });
    }
    query.then = (resolve: any) => {
      const data = table === 'profile_roles' ? [{roles: {code: admin && roleLookups++ === 0 ? 'admin' : 'driver'}}]
        : table === 'roles' ? {id: 'role-id'}
        : table === 'drivers' ? {id: 'driver-id', is_active: true, profiles: {id: 'profile-id'}}
        : table === 'profiles' ? {id: 'profile-id'}
        : {id: 'record-id', is_active: true};
      return Promise.resolve({data, error: null}).then(resolve);
    };
    return query;
  });
  const createUser = jest.fn().mockResolvedValue({data: {user: {id: 'new-profile-id'}}, error: null});
  const updateUserById = jest.fn().mockResolvedValue({data: {user: {id: 'profile-id'}}, error: null});
  const service = new StaffService({admin: {from, auth: {admin: {createUser, updateUserById}}}} as any);
  return {service, from, createUser, updateUserById, calls};
}

describe('Admin operational provisioning', () => {
  const driver = {phone: '+16505550102', fullName: 'Development Driver', role: 'driver' as const};

  it('rejects a Driver or Facility actor before creating a privileged account', async () => {
    const f = fixture(false);
    await expect(f.service.provision('driver-actor', driver)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(f.service.deactivate('driver-actor', 'other-id')).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.createUser).not.toHaveBeenCalled();
  });

  it('creates a Driver inactive first, assigns only the driver role, then activates', async () => {
    const f = fixture();
    await f.service.provision('admin-actor', driver);
    expect(f.createUser).toHaveBeenCalledWith(expect.objectContaining({
      phone: driver.phone, phone_confirm: true,
      user_metadata: expect.objectContaining({bw_staff_provisioning: true}),
    }));
    expect(f.calls.filter(call => call.table === 'customers')).toHaveLength(0);
    const profileUpdates = f.calls.filter(call => call.table === 'profiles' && call.method === 'update');
    expect(profileUpdates[0].value).toEqual(expect.objectContaining({is_active: false}));
    expect(profileUpdates[1].value).toEqual({is_active: true});
    expect(f.calls.some(call => call.table === 'drivers' && call.method === 'insert')).toBe(true);
  });

  it('requires an active facility for staff and never creates an Auth user otherwise', async () => {
    const f = fixture();
    await expect(f.service.provision('admin-actor', {...driver, role: 'facility_employee'})).rejects.toThrow('Active facility');
    expect(f.createUser).not.toHaveBeenCalled();
  });

  it('deactivates access and availability without deleting historical Driver rows', async () => {
    const f = fixture();
    await f.service.deactivate('admin-actor', 'driver-profile-id');
    expect(f.calls).toContainEqual({table: 'profiles', method: 'update', value: {is_active: false}});
    expect(f.calls).toContainEqual({table: 'drivers', method: 'update', value: {is_active: false, is_available: false}});
    expect(f.calls.some(call => call.method === 'delete')).toBe(false);
    expect(f.updateUserById).toHaveBeenCalledWith('driver-profile-id', {ban_duration: '876000h'});
    expect(f.calls.some(call => call.table === 'admin_staff_action_audit' && call.method === 'insert')).toBe(true);
  });

  it('re-enables staff using existing records and lifts the login ban', async () => {
    const f = fixture();
    await f.service.activate('admin-actor', 'driver-profile-id');
    expect(f.updateUserById).toHaveBeenCalledWith('driver-profile-id', {ban_duration: 'none'});
    expect(f.calls.some(call => call.method === 'delete')).toBe(false);
  });

  it('requires Admin for staff search, detail and facility reassignment', async () => {
    const f = fixture(false);
    await expect(f.service.list('driver-actor')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(f.service.detail('driver-actor', 'other-id')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(f.service.reassignFacility('driver-actor', 'other-id', 'facility-id')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
