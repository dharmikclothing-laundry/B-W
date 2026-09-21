/* Fictional Admin OTP and dashboard acceptance against local Supabase only. */
const fs = require('fs');
const path = require('path');
require('dotenv').config({path: path.join(__dirname, '..', '.env'), quiet: true});
const {createClient} = require('@supabase/supabase-js');
const local = value => { try { return ['localhost', '127.0.0.1', '::1'].includes(new URL(value).hostname); } catch { return false; } };
if (!local(process.env.SUPABASE_URL) || process.env.NODE_ENV === 'production' ||
    process.env.RAZORPAY_MODE !== 'mock' || process.env.GOOGLE_MAPS_MODE !== 'mock') {
  throw new Error('9A requires local Supabase and mock providers');
}
const config = fs.readFileSync(path.join(__dirname, '..', 'supabase/config.toml'), 'utf8');
const phone = '+16505550106';
const otp = config.match(/^16505550106\s*=\s*"(\d+)"/m)?.[1];
if (!otp) throw new Error('Local fictional Admin OTP unavailable');
const db = createClient(process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  {auth: {persistSession: false}});
const api = 'http://127.0.0.1:3001/v1';

async function call(method, route, body, token, expected) {
  const response = await fetch(`${api}${route}`, {method,
    headers: {...(body ? {'content-type': 'application/json'} : {}),
      ...(token ? {authorization: `Bearer ${token}`} : {})},
    ...(body ? {body: JSON.stringify(body)} : {})});
  if (response.status !== expected) throw new Error(`${method} ${route}: expected ${expected}, got ${response.status}`);
  return response.json().catch(() => ({}));
}

async function main() {
  const existing = await db.auth.admin.listUsers({page: 1, perPage: 1000});
  if (existing.error) throw new Error('Unable to inspect local identities');
  if (existing.data.users.some(user => user.phone === phone)) throw new Error('Fictional Admin phone is already in use');
  const created = await db.auth.admin.createUser({phone, phone_confirm: true,
    user_metadata: {full_name: '9A Fictional Admin', bw_admin_fixture: true}});
  if (created.error || !created.data.user) throw new Error('Privileged local Admin fixture creation failed');
  const id = created.data.user.id;
  try {
    const role = await db.from('roles').select('id').eq('code', 'admin').single();
    if (role.error || !role.data) throw new Error('Admin role unavailable');
    const assignment = await db.from('profile_roles').insert({profile_id: id, role_id: role.data.id});
    if (assignment.error) throw new Error('Privileged Admin role assignment failed');
    const active = await db.from('profiles').update({is_active: true}).eq('id', id).select('id').single();
    if (active.error || !active.data) throw new Error('Admin profile activation failed');
    await call('GET', '/admin/analytics/dashboard', undefined, undefined, 401);
    await call('POST', '/admin/staff', {phone: '+16505550107', fullName: 'Forbidden', role: 'admin'}, undefined, 401);
    console.log('PASS: anonymous Admin dashboard and provisioning rejected');
    await call('POST', '/auth/phone/request-otp', {phone}, undefined, 201);
    const login = await call('POST', '/auth/phone/verify-otp', {phone, token: otp}, undefined, 201);
    if (login.profile?.accountRole !== 'admin') throw new Error('Admin OTP did not resolve the privileged role');
    const token = login.session?.access_token;
    if (!token) throw new Error('Admin session missing');
    const me = await call('GET', '/auth/me', undefined, token, 200);
    if (me.roles.length !== 1 || me.roles[0].roles?.code !== 'admin') throw new Error('Admin role not exclusive');
    const dashboard = await call('GET', '/admin/analytics/dashboard', undefined, token, 200);
    if (!Array.isArray(dashboard) || dashboard.length !== 5 ||
        !dashboard.every(view => Array.isArray(view.data))) throw new Error('Admin analytics unavailable');
    console.log('PASS: privileged local OTP Admin login and five existing analytics views');
    await call('POST', '/admin/staff', {phone: '+16505550107', fullName: 'Forbidden', role: 'admin'}, token, 400);
    console.log('PASS: operational staff endpoint cannot create Admin accounts');
    const refreshed = await call('POST', '/auth/refresh', {refreshToken: login.session.refresh_token}, undefined, 201);
    if (refreshed.profile?.accountRole !== 'admin') throw new Error('Admin refresh lost role');
    console.log('PASS: Admin refresh-session preserves role');
    const disabled = await db.from('profiles').update({is_active: false}).eq('id', id);
    if (disabled.error) throw new Error('Local Admin disable failed');
    await call('GET', '/admin/analytics/dashboard', undefined, token, 401);
    await call('POST', '/auth/refresh', {refreshToken: refreshed.session.refresh_token}, undefined, 401);
    console.log('PASS: disabled Admin loses API and refresh access');
  } finally {
    const removed = await db.auth.admin.deleteUser(id);
    if (removed.error) throw new Error('Fictional Admin fixture cleanup failed');
  }
}
main().catch(error => {console.error(`FAIL: ${error.message}`); process.exitCode = 1;});
