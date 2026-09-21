/* Authenticated local Driver dashboard smoke. Never calls a Production endpoint. */
const path = require('path');
require('dotenv').config({path: path.join(__dirname, '..', '.env'), quiet: true});
const {createClient} = require('@supabase/supabase-js');

const host = value => {try {return new URL(value).hostname;} catch {return '';} };
if (!['localhost', '127.0.0.1', '::1'].includes(host(process.env.SUPABASE_URL)) ||
    process.env.NODE_ENV === 'production' || process.env.RAZORPAY_MODE !== 'mock' ||
    process.env.GOOGLE_MAPS_MODE !== 'mock') {
  throw new Error('7B acceptance requires local Supabase and mock providers');
}
const fs = require('fs');
const config = fs.readFileSync(path.join(__dirname, '..', 'supabase/config.toml'), 'utf8');
const code = config.match(/^16505550102\s*=\s*"(\d+)"/m)?.[1];
if (!code) throw new Error('Fictional local Driver OTP fixture is unavailable');
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
const admin = createClient(process.env.SUPABASE_URL, serviceKey, {auth: {persistSession: false}});
const publicAuth = createClient(process.env.SUPABASE_URL, anonKey, {auth: {persistSession: false}});
const api = 'http://127.0.0.1:3001/v1';

async function call(method, route, body, token, expected) {
  const response = await fetch(`${api}${route}`, {method,
    headers: {...(body ? {'content-type': 'application/json'} : {}), ...(token ? {authorization: `Bearer ${token}`} : {})},
    ...(body ? {body: JSON.stringify(body)} : {}),
  });
  if (response.status !== expected) {
    const problem = await response.json().catch(() => ({}));
    throw new Error(`${route}: expected ${expected}, got ${response.status} (${String(problem.message || 'no detail')})`);
  }
  return response.json().catch(() => ({}));
}

async function main() {
  const email = `bw-7b-admin-${Date.now()}@example.test`;
  const {data: created, error: createError} = await admin.auth.admin.createUser({
    email, email_confirm: true, user_metadata: {full_name: '7B Local Admin Fixture'},
  });
  if (createError || !created.user) throw new Error('Unable to create local Admin fixture');
  const adminId = created.user.id;
  let driverId;
  let adminToken;
  try {
    const {data: role, error: roleError} = await admin.from('roles').select('id').eq('code', 'admin').single();
    if (roleError || !role) throw new Error('Admin role unavailable');
    const {error: assignError} = await admin.from('profile_roles').insert({profile_id: adminId, role_id: role.id});
    if (assignError) throw new Error('Unable to assign local Admin fixture');
    const {data: link, error: linkError} = await admin.auth.admin.generateLink({type: 'magiclink', email});
    if (linkError || !link.properties?.hashed_token) throw new Error('Local Admin one-time link unavailable');
    const {data: session, error: loginError} = await publicAuth.auth.verifyOtp({
      token_hash: link.properties.hashed_token, type: 'magiclink',
    });
    if (loginError || !session.session?.access_token) throw new Error('Local Admin login failed');
    adminToken = session.session.access_token;
    const {data: users, error: usersError} = await admin.auth.admin.listUsers({page: 1, perPage: 1000});
    if (usersError) throw new Error('Unable to locate fictional Driver');
    const driverUser = users.users.find(user => String(user.phone || '').replace(/\D/g, '') === '16505550102');
    if (!driverUser || driverUser.user_metadata?.bw_staff_provisioning !== true) {
      throw new Error('Admin-provisioned fictional Driver is missing');
    }
    driverId = driverUser.id;
    await call('PATCH', `/admin/staff/${driverId}/activate`, undefined, adminToken, 200);
    await call('POST', '/auth/phone/request-otp', {phone: '+16505550102'}, undefined, 201);
    const login = await call('POST', '/auth/phone/verify-otp', {phone: '+16505550102', token: code}, undefined, 201);
    if (login.profile?.accountRole !== 'driver' || !login.session?.access_token) throw new Error('Driver OTP login failed');
    const driverToken = login.session.access_token;
    const dashboard = await call('GET', '/drivers/me/dashboard', undefined, driverToken, 200);
    if (!dashboard.summary || !Array.isArray(dashboard.pickups) || !Array.isArray(dashboard.deliveries)) {
      throw new Error('Driver dashboard response is incomplete');
    }
    for (const job of [...dashboard.pickups, ...dashboard.deliveries]) {
      if ('customer' in job || 'phone' in job) throw new Error('Queue exposed customer contact');
    }
    console.log('PASS: authenticated Driver dashboard and private queue response');
    if (dashboard.pickups[0] || dashboard.deliveries[0]) {
      const job = dashboard.pickups[0] || dashboard.deliveries[0];
      const detail = await call('GET', `/drivers/me/assignments/${job.id}`, undefined, driverToken, 200);
      if (detail.id !== job.id) throw new Error('Job detail did not match assignment');
      console.log('PASS: own assignment detail');
    } else {
      console.log('PASS: empty local assignment queues');
    }
    await call('GET', '/drivers/me/assignments/00000000-0000-4000-8000-000000000000', undefined, driverToken, 404);
    console.log('PASS: unassigned job detail rejected');
  } finally {
    if (driverId && adminToken) {
      try {await call('PATCH', `/admin/staff/${driverId}/deactivate`, undefined, adminToken, 200);}
      catch {console.error('FAIL: fictional Driver cleanup could not revoke access'); process.exitCode = 1;}
    }
    await admin.auth.admin.deleteUser(adminId);
  }
}
main().catch(error => {console.error(`FAIL: ${error.message}`); process.exitCode = 1;});
