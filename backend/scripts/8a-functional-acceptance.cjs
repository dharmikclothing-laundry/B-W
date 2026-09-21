/* Local-only authenticated Facility Staff/Manager acceptance; no external messaging. */
require('dotenv').config({path: require('path').join(__dirname, '..', '.env'), quiet: true});
const {createClient} = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const local = value => {try {return ['localhost', '127.0.0.1', '::1'].includes(new URL(value).hostname);} catch {return false;}};
if (!local(process.env.SUPABASE_URL) || process.env.NODE_ENV === 'production' ||
  process.env.RAZORPAY_MODE !== 'mock' || process.env.GOOGLE_MAPS_MODE !== 'mock') {
  throw new Error('8A requires local Supabase and mock providers');
}
const config = fs.readFileSync(path.join(__dirname, '..', 'supabase/config.toml'), 'utf8');
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY, {auth: {persistSession: false}});
const publicAuth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY, {auth: {persistSession: false}});
const api = 'http://127.0.0.1:3001/v1';
async function call(method, route, body, token, expected = 200) {
  const response = await fetch(`${api}${route}`, {method,
    headers: {...(body ? {'content-type': 'application/json'} : {}), ...(token ? {authorization: `Bearer ${token}`} : {})},
    ...(body ? {body: JSON.stringify(body)} : {})});
  if (response.status !== expected) throw new Error(`${method} ${route}: expected ${expected}, got ${response.status}`);
  return response.json().catch(() => ({}));
}
async function main() {
  const email = `bw-8a-admin-${Date.now()}@example.test`;
  const {data: created, error: creationError} = await admin.auth.admin.createUser({email, email_confirm: true});
  if (creationError || !created.user) throw new Error('Local Admin fixture unavailable');
  const adminId = created.user.id;
  const active = [];
  try {
    const {data: role} = await admin.from('roles').select('id').eq('code', 'admin').single();
    if (!role) throw new Error('Admin role missing');
    const {error: roleError} = await admin.from('profile_roles').insert({profile_id: adminId, role_id: role.id});
    if (roleError) throw new Error('Admin fixture role unavailable');
    const {data: link} = await admin.auth.admin.generateLink({type: 'magiclink', email});
    const {data: session} = await publicAuth.auth.verifyOtp({token_hash: link.properties.hashed_token, type: 'magiclink'});
    const adminToken = session.session.access_token;
    const {data: facilities} = await admin.from('facilities').select('id').eq('name', '7A Local Facility Fixture').eq('is_active', true).limit(1);
    const facilityId = facilities?.[0]?.id;
    if (!facilityId) throw new Error('Existing local Facility fixture absent');
    await call('POST', '/admin/staff', {phone: '+16505550103', fullName: 'Forbidden', role: 'manager', facilityId}, undefined, 401);
    console.log('PASS: anonymous Facility provisioning rejected');
    const {data: users, error: usersError} = await admin.auth.admin.listUsers({page: 1, perPage: 1000});
    if (usersError) throw new Error('Unable to inspect local fictional accounts');
    for (const [phone, roleCode] of [['+16505550103', 'facility_employee'], ['+16505550104', 'manager']]) {
      const otp = config.match(new RegExp(`^${phone.slice(1)}\\s*=\\s*"(\\d+)"`, 'm'))?.[1];
      if (!otp) throw new Error('Local fictional Facility OTP fixture missing');
      let user = users.users.find(item => String(item.phone || '').replace(/\D/g, '') === phone.slice(1));
      if (user && user.user_metadata?.bw_staff_provisioning !== true) throw new Error('Fictional phone belongs to another account');
      if (user) {
        const {data: assignment} = await admin.from('facility_employees').select('facility_id,employee_role').eq('profile_id', user.id).maybeSingle();
        if (assignment?.facility_id !== facilityId || assignment?.employee_role !== roleCode) throw new Error('Existing fictional role/facility mismatch');
        await call('PATCH', `/admin/staff/${user.id}/activate`, undefined, adminToken);
      } else {
        const result = await call('POST', '/admin/staff', {phone, fullName: `8A Local ${roleCode}`, role: roleCode, facilityId}, adminToken, 201);
        user = {id: result.profileId};
      }
      active.push(user.id);
      await call('POST', '/auth/phone/request-otp', {phone}, undefined, 201);
      const verified = await call('POST', '/auth/phone/verify-otp', {phone, token: otp}, undefined, 201);
      if (verified.profile?.accountRole !== roleCode) throw new Error('Incorrect operational role at login');
      const token = verified.session.access_token;
      const me = await call('GET', '/auth/me', undefined, token);
      if (me.roles.length !== 1 || me.roles[0].roles?.code !== roleCode) throw new Error('Unexpected Customer or privileged role');
      const dashboard = await call('GET', '/facility/me/dashboard', undefined, token);
      if (dashboard.facility?.id !== facilityId || dashboard.role !== roleCode || !Array.isArray(dashboard.orders)) throw new Error('Dashboard was not scoped to assigned facility');
      await call('POST', '/admin/staff', {phone: '+16505550102', fullName: 'Forbidden', role: 'driver'}, token, 403);
      const refreshed = await call('POST', '/auth/refresh', {refreshToken: verified.session.refresh_token}, undefined, 201);
      if (refreshed.profile?.accountRole !== roleCode) throw new Error('Facility session restore changed role');
      console.log(`PASS: ${roleCode} local OTP, self-scoped dashboard, role enforcement, and session restore`);
      await call('PATCH', `/admin/staff/${user.id}/deactivate`, undefined, adminToken);
      active.pop();
      await call('GET', '/facility/me/dashboard', undefined, token, 401);
      await call('POST', '/auth/refresh', {refreshToken: refreshed.session.refresh_token}, undefined, 401);
      console.log(`PASS: disabled ${roleCode} access blocked; historical employee retained`);
    }
  } finally {
    for (const id of active) {
      await admin.from('profiles').update({is_active: false}).eq('id', id);
      await admin.from('facility_employees').update({is_active: false}).eq('profile_id', id);
    }
    await admin.auth.admin.deleteUser(adminId);
  }
}
main().catch(error => {console.error(`FAIL: ${error.message}`); process.exitCode = 1;});
