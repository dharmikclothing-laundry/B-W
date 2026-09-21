/* Local-only Admin provisioning, OTP, RBAC, session and deactivation acceptance. */
require('dotenv').config({path: require('path').join(__dirname, '..', '.env'), quiet: true});
const {createClient} = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const localHost = value => {
  try {return ['localhost', '127.0.0.1', '::1'].includes(new URL(value).hostname);} catch {return false;}
};
if (!localHost(process.env.SUPABASE_URL) || process.env.NODE_ENV === 'production' ||
    process.env.RAZORPAY_MODE !== 'mock' || process.env.GOOGLE_MAPS_MODE !== 'mock') {
  throw new Error('7A acceptance requires local Supabase and mock providers');
}
const api = 'http://127.0.0.1:3001/v1';
const config = fs.readFileSync(path.join(__dirname, '..', 'supabase/config.toml'), 'utf8');
const fixturePhone = '+16505550102';
const match = config.match(/^16505550102\s*=\s*"(\d+)"/m);
if (!match) throw new Error('Fictional local Driver OTP fixture missing');
const otp = match[1];
const adminKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
const admin = createClient(process.env.SUPABASE_URL, adminKey, {auth: {persistSession: false}});
const publicAuth = createClient(process.env.SUPABASE_URL, anonKey, {auth: {persistSession: false}});

async function call(method, route, body, token, expected = 200) {
  const response = await fetch(`${api}${route}`, {
    method,
    headers: {...(body ? {'content-type': 'application/json'} : {}), ...(token ? {authorization: `Bearer ${token}`} : {})},
    ...(body ? {body: JSON.stringify(body)} : {}),
  });
  if (response.status !== expected) {
    const problem = await response.json().catch(() => ({}));
    throw new Error(`${method} ${route}: expected ${expected}, got ${response.status} (${String(problem.message || 'no detail')})`);
  }
  return response.json().catch(() => ({}));
}

async function main() {
  const email = `bw-7a-admin-${Date.now()}@example.test`;
  const {data: created, error: createError} = await admin.auth.admin.createUser({
    email, email_confirm: true, user_metadata: {full_name: '7A Local Admin Fixture'},
  });
  if (createError || !created.user) throw new Error('Unable to create local Admin fixture');
  const adminId = created.user.id;
  try {
    const {data: role, error: roleError} = await admin.from('roles').select('id').eq('code', 'admin').single();
    if (roleError || !role) throw new Error('Admin role missing');
    const {error: assignError} = await admin.from('profile_roles').insert({profile_id: adminId, role_id: role.id});
    if (assignError) throw new Error('Unable to assign local Admin fixture');
    const {data: link, error: linkError} = await admin.auth.admin.generateLink({type: 'magiclink', email});
    if (linkError || !link.properties?.hashed_token) throw new Error('Unable to create local one-time Admin link');
    const {data: session, error: sessionError} = await publicAuth.auth.verifyOtp({
      token_hash: link.properties.hashed_token, type: 'magiclink',
    });
    if (sessionError || !session.session?.access_token) throw new Error('Unable to verify local Admin one-time link');
    const adminToken = session.session.access_token;
    await call('POST', '/admin/staff', {phone: fixturePhone, fullName: 'Forbidden', role: 'driver'}, undefined, 401);
    console.log('PASS: anonymous account provisioning blocked');

    const {data: existing, error: existingError} = await admin.auth.admin.listUsers({page: 1, perPage: 1000});
    if (existingError) throw new Error('Unable to inspect local fixture users');
    const matchUser = existing.users.find(user =>
      String(user.phone || '').replace(/\D/g, '') === fixturePhone.replace(/\D/g, ''));
    let driverId;
    if (matchUser) {
      if (matchUser.user_metadata?.bw_staff_provisioning !== true) {
        throw new Error('Fictional Driver number already belongs to a non-7A account');
      }
      driverId = matchUser.id;
      await call('PATCH', `/admin/staff/${driverId}/activate`, undefined, adminToken);
    } else {
      const createdDriver = await call('POST', '/admin/staff', {
        phone: fixturePhone, fullName: 'Development Driver', role: 'driver',
      }, adminToken, 201);
      driverId = createdDriver.profileId;
    }
    if (!driverId) throw new Error('Admin provisioning returned no Driver id');
    console.log('PASS: fictional Driver provisioned through Admin endpoint');

    await call('POST', '/auth/phone/request-otp', {phone: fixturePhone}, undefined, 201);
    const verified = await call('POST', '/auth/phone/verify-otp', {phone: fixturePhone, token: otp}, undefined, 201);
    if (verified.profile?.accountRole !== 'driver' || !verified.session?.access_token) {
      throw new Error('Driver OTP login did not return the existing B&W role/session');
    }
    const driverToken = verified.session.access_token;
    console.log('PASS: local OTP Driver authentication');
    const me = await call('GET', '/auth/me', undefined, driverToken);
    const roleCodes = (me.roles || []).map(row => row.roles?.code);
    if (roleCodes.length !== 1 || roleCodes[0] !== 'driver') throw new Error('Driver gained an unexpected role');
    const profile = await call('GET', '/drivers/me/profile', undefined, driverToken);
    if (profile.profiles?.phone !== fixturePhone || !profile.is_active) throw new Error('Driver profile is incomplete');
    await call('PATCH', '/drivers/me/profile', {fullName: 'Development Driver 7A'}, driverToken);
    console.log('PASS: Driver profile read/edit and no customer role');
    await call('POST', '/admin/staff', {phone: '+16505550103', fullName: 'Forbidden', role: 'facility_employee'}, driverToken, 403);
    await call('POST', '/admin/staff', {phone: '+16505550103', fullName: 'Forbidden', role: 'driver'}, driverToken, 403);
    console.log('PASS: handcrafted Driver provisioning requests rejected');

    let {data: facilities, error: facilityError} = await admin.from('facilities')
      .select('id').eq('name', '7A Local Facility Fixture').limit(1);
    if (facilityError) throw new Error('Unable to read local Facility fixture');
    let facilityId = facilities?.[0]?.id;
    if (!facilityId) {
      const fixture = await admin.from('facilities').insert({name: '7A Local Facility Fixture', is_active: true})
        .select('id').single();
      if (fixture.error || !fixture.data) throw new Error('Unable to create local Facility fixture');
      facilityId = fixture.data.id;
    }
    for (const [number, role] of [['+16505550103', 'facility_employee'], ['+16505550104', 'manager']]) {
      const {data: list, error: listError} = await admin.auth.admin.listUsers({page: 1, perPage: 1000});
      if (listError) throw new Error('Unable to inspect local Facility users');
      const previous = list.users.find(user => String(user.phone || '').replace(/\D/g, '') === number.replace(/\D/g, ''));
      let staffId;
      if (previous) {
        if (previous.user_metadata?.bw_staff_provisioning !== true) throw new Error('Fictional Facility number already belongs to another account');
        staffId = previous.id;
        await call('PATCH', `/admin/staff/${staffId}/activate`, undefined, adminToken);
      } else {
        const newStaff = await call('POST', '/admin/staff', {
          phone: number, fullName: `7A Local ${role}`, role, facilityId,
        }, adminToken, 201);
        staffId = newStaff.profileId;
      }
      const {data: assignments, error: assignmentError} = await admin.from('profile_roles')
        .select('roles(code)').eq('profile_id', staffId);
      if (assignmentError || assignments.length !== 1 || assignments[0].roles?.code !== role) {
        throw new Error('Facility account received an unexpected role');
      }
      await call('PATCH', `/admin/staff/${staffId}/deactivate`, undefined, adminToken);
    }
    console.log('PASS: Facility Staff and Manager only provisioned and deactivated by Admin');
    const refreshed = await call('POST', '/auth/refresh', {refreshToken: verified.session.refresh_token}, undefined, 201);
    if (refreshed.profile?.accountRole !== 'driver') throw new Error('Driver refresh changed account role');
    console.log('PASS: Driver refresh retains privileged role');

    await call('PATCH', `/admin/staff/${driverId}/deactivate`, undefined, adminToken);
    await call('GET', '/drivers/me/profile', undefined, driverToken, 401);
    await call('POST', '/auth/refresh', {refreshToken: refreshed.session.refresh_token}, undefined, 401);
    const {data: storedDriver, error: driverError} = await admin.from('drivers')
      .select('id,is_active,is_available').eq('profile_id', driverId).single();
    if (driverError || !storedDriver || storedDriver.is_active || storedDriver.is_available) {
      throw new Error('Driver deactivation did not retain a disabled historical record');
    }
    console.log('PASS: disabled Driver blocked; historical Driver record retained');
  } finally {
    // Local Admin fixture has no order or audit attribution; Driver is never deleted.
    await admin.auth.admin.deleteUser(adminId);
  }
}
main().catch(error => {console.error(`FAIL: ${error.message}`); process.exitCode = 1;});
