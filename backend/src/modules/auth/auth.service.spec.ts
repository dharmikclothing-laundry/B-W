import { AuthService } from './auth.service';

function fixture(failure?: string, active = true, accountRole?: string, facilityActive = true) {
  const calls: string[] = [];
  const db = { from: jest.fn((table: string) => {
    calls.push(table);
    const data = table === 'roles' ? { id: 'customer-role' }
      : table === 'profile_roles' ? (accountRole ? [{ roles: { code: accountRole } }] : [])
      : table === 'drivers' ? { id: 'staff-record', is_active: active }
      : table === 'facility_employees' ? { id: 'staff-record', facility_id: 'facility-1', employee_role: accountRole, is_active: active }
      : table === 'facilities' ? { id: 'facility-1', is_active: facilityActive }
      : { id: 'verified-user', is_active: active };
    const result = { data, error: table === failure ? { message: 'database failure' } : null };
    const query: any = { then: (resolve: any) => Promise.resolve(result).then(resolve) };
    for (const method of ['upsert', 'select', 'eq', 'single', 'maybeSingle']) query[method] = jest.fn(() => query);
    return query;
  }) };
  const user = { id: 'verified-user', phone: '16505550101' };
  const session = {
    access_token: 'test-access-token',
    refresh_token: 'test-rotated-refresh-token',
  };
  const verifyOtp = jest.fn().mockResolvedValue({
    data: { user, session },
    error: null,
  });
  const refreshSession = jest.fn().mockResolvedValue({
    data: { user, session },
    error: null,
  });
  const createAuthClient = jest.fn(() => ({
    auth: { verifyOtp, refreshSession },
  }));
  return {
    service: new AuthService({ admin: db, createAuthClient } as any),
    db,
    calls,
    createAuthClient,
    verifyOtp,
    refreshSession,
    session,
    user,
  };
}

describe('AuthService provisioning', () => {
  it('provisions customer and role even when the profile trigger already created a profile', async () => {
    const f = fixture();
    await f.service.verifyOtp('+16505550101', '123456');
    expect(f.calls).toEqual(['profiles', 'profiles', 'profile_roles', 'roles', 'profile_roles', 'customers']);
    expect(f.createAuthClient).toHaveBeenCalledTimes(1);
  });
  it.each(['profiles', 'roles', 'profile_roles', 'customers'])('surfaces %s provisioning failures', async table => {
    await expect(fixture(table).service.ensureProfile('verified-user')).rejects.toThrow();
  });
  it('rejects inactive profiles before assigning roles or creating customers', async () => {
    const f = fixture(undefined, false);
    await expect(f.service.ensureProfile('verified-user')).rejects.toThrow('Inactive');
    expect(f.calls).toEqual(['profiles', 'profiles']);
  });
  it('does not provision when verification fails', async () => {
    const f = fixture();
    f.verifyOtp.mockResolvedValue({ data: { user: null, session: null }, error: { message: 'Invalid OTP' } } as any);
    await expect(f.service.verifyOtp('+16505550101', '000000')).rejects.toThrow('Invalid OTP');
    expect(f.db.from).not.toHaveBeenCalled();
  });

  it('refreshes a session with an isolated auth client and repairs provisioning', async () => {
    const f = fixture();

    const result = await f.service.refresh('submitted-refresh-token');

    expect(f.createAuthClient).toHaveBeenCalledTimes(1);
    expect(f.refreshSession).toHaveBeenCalledWith({
      refresh_token: 'submitted-refresh-token',
    });
    expect(f.calls).toEqual(['profiles', 'profiles', 'profile_roles', 'roles', 'profile_roles', 'customers']);
    expect(result).toEqual({
      session: f.session,
      user: f.user,
      profile: { id: 'verified-user', is_active: true, accountRole: 'customer' },
    });
  });

  it('keeps an Admin-provisioned driver out of customer provisioning on OTP and refresh', async () => {
    const f = fixture(undefined, true, 'driver');
    const verified = await f.service.verifyOtp('+16505550101', '123456');
    expect(verified.profile.accountRole).toBe('driver');
    await f.service.refresh('refresh-token');
    expect(f.calls).not.toContain('customers');
    expect(f.calls).not.toContain('roles');
    expect(f.calls.filter(name => name === 'drivers')).toHaveLength(2);
  });

  it.each(['facility_employee', 'manager'])('keeps %s out of customer provisioning', async role => {
    const f = fixture(undefined, true, role);
    const verified = await f.service.verifyOtp('+16505550103', '123456');
    expect(verified.profile.accountRole).toBe(role);
    expect(f.calls).toContain('facility_employees');
    expect(f.calls).not.toContain('customers');
  });

  it('preserves a privileged Admin OTP session and refresh without customer provisioning', async () => {
    const f = fixture(undefined, true, 'admin');
    const verified = await f.service.verifyOtp('+16505550106', 'local-code');
    expect(verified.profile.accountRole).toBe('admin');
    const refreshed = await f.service.refresh('refresh-token');
    expect(refreshed.profile.accountRole).toBe('admin');
    expect(f.calls).not.toContain('customers');
    expect(f.calls).not.toContain('roles');
  });

  it('blocks a disabled Admin on OTP and refresh', async () => {
    const f = fixture(undefined, false, 'admin');
    await expect(f.service.verifyOtp('+16505550106', 'local-code')).rejects.toThrow('Inactive');
    await expect(f.service.refresh('refresh-token')).rejects.toThrow('Inactive');
  });

  it('blocks Facility login and session refresh after assigned facility is disabled', async () => {
    const f = fixture(undefined, true, 'facility_employee', false);
    await expect(f.service.verifyOtp('+16505550103', '123456')).rejects.toThrow('Inactive facility');
    await expect(f.service.refresh('refresh-token')).rejects.toThrow('Inactive facility');
    expect(f.calls).not.toContain('customers');
  });

  it('rejects a privileged profile with mixed customer and staff roles', async () => {
    const f = fixture(undefined, true, 'driver');
    const original = f.db.from;
    f.db.from = jest.fn((table: string) => {
      const query = original(table);
      if (table === 'profile_roles') query.then = (resolve: any) =>
        Promise.resolve({ data: [{ roles: { code: 'driver' } }, { roles: { code: 'customer' } }], error: null }).then(resolve);
      return query;
    });
    await expect(f.service.ensureProfile('verified-user')).rejects.toThrow('Conflicting account roles');
  });

  it('rejects an invalid refresh session without provisioning or exposing provider details', async () => {
    const f = fixture();
    f.refreshSession.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'provider detail containing sensitive context' },
    } as any);

    await expect(f.service.refresh('submitted-refresh-token')).rejects.toThrow(
      'Invalid or expired refresh session',
    );
    expect(f.db.from).not.toHaveBeenCalled();
  });

  it.each([
    { user: null, session: { access_token: 'test-token' } },
    { user: { id: 'verified-user' }, session: null },
  ])('rejects an incomplete refresh response', async data => {
    const f = fixture();
    f.refreshSession.mockResolvedValue({ data, error: null } as any);

    await expect(f.service.refresh('submitted-refresh-token')).rejects.toThrow(
      'Invalid or expired refresh session',
    );
    expect(f.db.from).not.toHaveBeenCalled();
  });
});
