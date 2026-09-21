/* Repeatable fictional local-only Admin staff lifecycle acceptance. */
const fs = require('fs');
const path = require('path');
require('dotenv').config({path: path.join(__dirname, '..', '.env'), quiet: true});
const {createClient} = require('@supabase/supabase-js');
const local = value => {try {return ['localhost', '127.0.0.1', '::1'].includes(new URL(value).hostname);} catch {return false;}};
if (!local(process.env.SUPABASE_URL) || process.env.NODE_ENV === 'production' ||
    process.env.RAZORPAY_MODE !== 'mock' || process.env.GOOGLE_MAPS_MODE !== 'mock')
  throw new Error('9C requires local Supabase and mock providers');
const config = fs.readFileSync(path.join(__dirname, '..', 'supabase/config.toml'), 'utf8');
const otp = config.match(/^16505550106\s*=\s*"(\d+)"/m)?.[1];
if (!otp) throw new Error('Fictional local Admin OTP unavailable');
const db = createClient(process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  {auth: {persistSession: false}});
const api = 'http://127.0.0.1:3001/v1';
const samePhone = (left, right) => String(left ?? '').replace(/\D/g, '') === String(right ?? '').replace(/\D/g, '');
async function one(label, query) {
  const {data, error} = await query;
  if (error || !data) throw new Error(`${label}: ${error?.message || 'missing record'}`);
  return data;
}
async function call(method, route, token, expected, body) {
  const response = await fetch(`${api}${route}`, {method,
    headers: {...(token ? {authorization: `Bearer ${token}`} : {}), ...(body ? {'content-type': 'application/json'} : {})},
    ...(body ? {body: JSON.stringify(body)} : {})});
  if (response.status !== expected) throw new Error(`${method} ${route}: expected ${expected}, got ${response.status}`);
  return response.json().catch(() => ({}));
}
async function main() {
  const adminPhone = '+16505550106';
  const users = await db.auth.admin.listUsers({page: 1, perPage: 1000});
  if (users.error) throw new Error('Unable to inspect local fictional identities');
  let admin = users.data.users.find(user => samePhone(user.phone, adminPhone));
  if (admin && admin.user_metadata?.bw_9c_fixture !== true) throw new Error('Fictional Admin phone belongs to another local identity');
  if (!admin) {
    const result = await db.auth.admin.createUser({phone: adminPhone, phone_confirm: true,
      user_metadata: {full_name: '9C Fictional Admin', bw_9c_fixture: true}});
    if (result.error || !result.data.user) throw new Error('Fictional Admin creation failed');
    admin = result.data.user;
    const role = await one('Admin role', db.from('roles').select('id').eq('code', 'admin').single());
    await one('Admin role assignment', db.from('profile_roles').insert({profile_id: admin.id, role_id: role.id}).select('profile_id').single());
    await one('Admin activation', db.from('profiles').update({is_active: true}).eq('id', admin.id).select('id').single());
  }
  let facilities = await one('Active local facilities', db.from('facilities').select('id,name').eq('is_active', true).limit(20));
  while (facilities.length < 2) {
    const facility = await one('Fictional facility', db.from('facilities').insert({name: `9C Fictional Facility ${facilities.length + 1}`}).select('id,name').single());
    facilities.push(facility);
  }
  await call('GET', '/admin/staff', null, 401);
  const login = await call('POST', '/auth/phone/request-otp', null, 201, {phone: adminPhone});
  if (!login.sent) throw new Error('Local Admin OTP request failed');
  const verified = await call('POST', '/auth/phone/verify-otp', null, 201, {phone: adminPhone, token: otp});
  const token = verified.session?.access_token;
  if (!token || verified.profile?.accountRole !== 'admin') throw new Error('Privileged Admin login failed');
  console.log('PASS: fictional local Admin OTP and anonymous staff-route rejection');
  const specs = [
    {phone: '+16505550107', fullName: '9C Fictional Driver', role: 'driver'},
    {phone: '+16505550108', fullName: '9C Fictional Manager', role: 'manager', facilityId: facilities[0].id},
    {phone: '+16505550109', fullName: '9C Fictional Staff', role: 'facility_employee', facilityId: facilities[0].id},
  ];
  const created = [];
  const freshUsers = await db.auth.admin.listUsers({page: 1, perPage: 1000});
  if (freshUsers.error) throw new Error('Unable to check local staff identities');
  for (const spec of specs) {
    let user = freshUsers.data.users.find(candidate => samePhone(candidate.phone, spec.phone));
    let profileId;
    if (user) {
      if (user.user_metadata?.full_name !== spec.fullName || user.user_metadata?.bw_staff_provisioning !== true)
        throw new Error('Fictional staff phone belongs to another local identity');
      profileId = user.id;
      await call('PATCH', `/admin/staff/${profileId}/activate`, token, 200);
      if (spec.facilityId) {
        const current = await call('GET', `/admin/staff/${profileId}`, token, 200);
        if (current.staff?.facility_id !== spec.facilityId)
          await call('PATCH', `/admin/staff/${profileId}/facility`, token, 200, {facilityId: spec.facilityId});
      }
    } else {
      const result = await call('POST', '/admin/staff', token, 201, spec);
      profileId = result.profileId;
      if (!profileId) throw new Error('Admin provisioning did not return a profile');
    }
    created.push({...spec, profileId});
  }
  console.log('PASS: Admin-provisioned Driver, Facility Manager and Staff accounts');
  const roster = await call('GET', '/admin/staff?role=driver&status=active&search=9C', token, 200);
  if (!roster.some(row => row.profile_id === created[0].profileId)) throw new Error('Driver search/filter missed fictional account');
  const manager = await call('GET', `/admin/staff/${created[1].profileId}`, token, 200);
  if (manager.staff?.facility_id !== facilities[0].id || !Array.isArray(manager.audit) || !Array.isArray(manager.workload))
    throw new Error('Facility profile, workload or audit missing');
  console.log('PASS: Admin staff search, filter, profile, role, Facility, workload and audit');
  const driverId = created[0].profileId;
  await call('PATCH', `/admin/staff/${driverId}/deactivate`, token, 200);
  const banned = await db.auth.admin.getUserById(driverId);
  if (banned.error || !banned.data.user?.banned_until) throw new Error('Disabled Driver login was not banned');
  const disabled = await one('Disabled Driver profile', db.from('profiles').select('is_active').eq('id', driverId).single());
  if (disabled.is_active) throw new Error('Disabled Driver still has protected access');
  await call('PATCH', `/admin/staff/${driverId}/activate`, token, 200);
  const restored = await one('Re-enabled Driver profile', db.from('profiles').select('is_active').eq('id', driverId).single());
  if (!restored.is_active) throw new Error('Driver access did not restore');
  console.log('PASS: Driver deactivation bans login and protected access; Admin re-enable restores account');
  await call('PATCH', `/admin/staff/${created[1].profileId}/facility`, token, 200, {facilityId: facilities[1].id});
  const moved = await call('GET', `/admin/staff/${created[1].profileId}`, token, 200);
  if (moved.staff?.facility_id !== facilities[1].id) throw new Error('Facility reassignment failed');
  await call('PATCH', `/admin/staff/${created[2].profileId}/revoke-access`, token, 200);
  const revoked = await one('Revoked staff profile', db.from('profiles').select('is_active').eq('id', created[2].profileId).single());
  if (revoked.is_active) throw new Error('Revoked staff still has protected access');
  console.log('PASS: Facility reassignment and staff access revocation');
  for (const spec of created) {
    const current = await one('Staff status', db.from('profiles').select('is_active').eq('id', spec.profileId).single());
    if (current.is_active) await call('PATCH', `/admin/staff/${spec.profileId}/deactivate`, token, 200);
    const audit = await one('Staff audit', db.from('admin_staff_action_audit').select('id,action').eq('target_profile_id', spec.profileId));
    if (!audit.length) throw new Error('Staff action audit missing');
  }
  const retainedDriver = await one('Historical Driver record', db.from('drivers').select('id,is_active').eq('profile_id', driverId).single());
  if (retainedDriver.is_active) throw new Error('Fictional Driver was not safely deactivated');
  console.log('PASS: all fictional operational accounts left disabled with immutable audit and retained records');
}
main().catch(error => {console.error(`FAIL: ${error.message}`); process.exitCode = 1;});
