/* Fictional, local-only 7C assignment acceptance. Never uses Production. */
const path = require('path');
require('dotenv').config({path: path.join(__dirname, '..', '.env'), quiet: true});
const fs = require('fs');
const {createClient} = require('@supabase/supabase-js');
const host = value => {try {return new URL(value).hostname;} catch {return '';} };
if (!['localhost', '127.0.0.1', '::1'].includes(host(process.env.SUPABASE_URL)) ||
    process.env.NODE_ENV === 'production' || process.env.RAZORPAY_MODE !== 'mock' ||
    process.env.GOOGLE_MAPS_MODE !== 'mock') throw new Error('7C acceptance requires local Supabase and mock providers');
const config = fs.readFileSync(path.join(__dirname, '..', 'supabase/config.toml'), 'utf8');
const otp = phone => config.match(new RegExp(`^${phone.replace('+', '')}\\s*=\\s*"(\\d+)"`, 'm'))?.[1];
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY, {auth: {persistSession: false}});
const publicAuth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY, {auth: {persistSession: false}});
const api = 'http://127.0.0.1:3001/v1';
async function call(method, route, body, token, expected) {
  const response = await fetch(`${api}${route}`, {method, headers: {...(body ? {'content-type': 'application/json'} : {}), ...(token ? {authorization: `Bearer ${token}`} : {})}, ...(body ? {body: JSON.stringify(body)} : {})});
  if (response.status !== expected) throw new Error(`${route}: expected ${expected}, got ${response.status}`);
  return response.json().catch(() => ({}));
}
async function one(table, query) {
  const result = await query;
  if (result.error || !result.data) throw new Error(`Local ${table} fixture unavailable (${result.error?.code || 'empty'})`);
  return result.data;
}
async function main() {
  const phone1 = '+16505550102', phone2 = '+16505550105';
  if (!otp(phone1)) throw new Error('Fictional local OTP fixture missing');
  const email = `bw-7c-admin-${Date.now()}@example.test`;
  const created = await admin.auth.admin.createUser({email, email_confirm: true, user_metadata: {full_name: '7C Local Admin'}});
  if (created.error || !created.data.user) throw new Error('Local Admin fixture unavailable');
  const adminId = created.data.user.id;
  let adminToken, orderId, secondProfile;
  try {
    const role = await one('roles', admin.from('roles').select('id').eq('code', 'admin').single());
    await one('profile_roles', admin.from('profile_roles').insert({profile_id: adminId, role_id: role.id}).select('profile_id').single());
    const link = await admin.auth.admin.generateLink({type: 'magiclink', email});
    const session = await publicAuth.auth.verifyOtp({token_hash: link.data?.properties?.hashed_token, type: 'magiclink'});
    adminToken = session.data?.session?.access_token;
    if (!adminToken) throw new Error('Local Admin login failed');
    const users = await admin.auth.admin.listUsers({page: 1, perPage: 1000});
    if (users.error) throw new Error('Unable to inspect fictional Drivers');
    const samePhone = (left, right) => String(left || '').replace(/\D/g, '') === right.replace(/\D/g, '');
    const existing = users.data.users.find(user => samePhone(user.phone, phone1));
    if (!existing?.user_metadata?.bw_staff_provisioning) throw new Error('7A Admin-provisioned Driver missing');
    const firstProfile = existing.id;
    await call('PATCH', `/admin/staff/${firstProfile}/activate`, undefined, adminToken, 200);
    const second = users.data.users.find(user => samePhone(user.phone, phone2));
    if (second && !second.user_metadata?.bw_staff_provisioning) throw new Error('Fictional replacement number is occupied');
    secondProfile = second ? second.id : (await call('POST', '/admin/staff', {phone: phone2, fullName: '7C Fictional Replacement', role: 'driver'}, adminToken, 201)).profileId;
    if (second) await call('PATCH', `/admin/staff/${secondProfile}/activate`, undefined, adminToken, 200);
    const firstDriver = await one('drivers', admin.from('drivers').select('id').eq('profile_id', firstProfile).single());
    const secondDriver = await one('drivers', admin.from('drivers').select('id').eq('profile_id', secondProfile).single());
    for (const driver of [firstDriver, secondDriver]) {
      const availability = await admin.from('drivers').update({is_available: true}).eq('id', driver.id);
      if (availability.error) throw new Error('Local Driver availability fixture failed');
    }
    const source = await one('orders', admin.from('orders').select('customer_id,facility_id,pickup_address_id,delivery_address_id').eq('current_status', 'confirmed').limit(1).single());
    const inserted = await one('orders', admin.from('orders').insert({order_number: `BW-7C-${Date.now()}`, customer_id: source.customer_id, facility_id: source.facility_id, pickup_address_id: source.pickup_address_id, delivery_address_id: source.delivery_address_id, current_status: 'draft'}).select('id').single());
    orderId = inserted.id;
    const transition = await admin.rpc('change_order_status', {p_order_id: orderId, p_new_status: 'confirmed', p_reason: '7C local acceptance fixture'});
    if (transition.error) throw new Error(`Local status transition failed (${transition.error.code})`);
    const assignment = await one('assignment', admin.rpc('create_driver_assignment_atomic', {p_order_id: orderId, p_driver_id: firstDriver.id, p_assignment_type: 'pickup', p_assignment_score: 0}));
    const oldId = assignment.assignment.id;
    await call('POST', '/auth/phone/request-otp', {phone: phone1}, undefined, 201);
    const firstLogin = await call('POST', '/auth/phone/verify-otp', {phone: phone1, token: otp(phone1)}, undefined, 201);
    const secondEmail = `bw-7c-driver-${Date.now()}@example.test`;
    const emailUpdate = await admin.auth.admin.updateUserById(secondProfile, {email: secondEmail, email_confirm: true});
    if (emailUpdate.error) throw new Error('Local replacement Driver email fixture failed');
    const secondLink = await admin.auth.admin.generateLink({type: 'magiclink', email: secondEmail});
    const secondSession = await publicAuth.auth.verifyOtp({token_hash: secondLink.data?.properties?.hashed_token, type: 'magiclink'});
    const firstToken = firstLogin.session.access_token, secondToken = secondSession.data?.session?.access_token;
    if (!secondToken) throw new Error('Local replacement Driver session failed');
    await call('POST', `/driver-assignments/${oldId}/reject`, {reason: ' '}, firstToken, 400);
    await call('POST', `/driver-assignments/${oldId}/accept`, undefined, secondToken, 404);
    await call('POST', `/driver-assignments/${oldId}/reassign`, {newDriverId: secondDriver.id}, firstToken, 403);
    console.log('PASS: reason required, wrong Driver blocked, Driver reassignment blocked');
    const replacement = await call('POST', `/driver-assignments/${oldId}/reassign`, {newDriverId: secondDriver.id}, adminToken, 201);
    const newId = replacement.assignment.id;
    await call('GET', `/drivers/me/assignments/${oldId}`, undefined, firstToken, 404);
    await call('GET', `/drivers/me/assignments/${newId}`, undefined, secondToken, 200);
    await call('POST', `/driver-assignments/${oldId}/accept`, undefined, firstToken, 409);
    await call('POST', `/driver-assignments/${newId}/accept`, undefined, firstToken, 404);
    await call('POST', `/driver-assignments/${newId}/accept`, undefined, secondToken, 201);
    await call('POST', `/driver-assignments/${newId}/accept`, undefined, secondToken, 409);
    console.log('PASS: Admin reassignment revokes old access; new Driver accepts once');
    const order = await one('orders', admin.from('orders').select('current_status').eq('id', orderId).single());
    if (order.current_status !== 'pickup_accepted') throw new Error('Order lifecycle diverged');
    console.log('PASS: approved customer order lifecycle retained');
  } finally {
    if (orderId) await admin.from('orders').delete().eq('id', orderId);
    if (adminToken && secondProfile) await call('PATCH', `/admin/staff/${secondProfile}/deactivate`, undefined, adminToken, 200).catch(() => {process.exitCode = 1;});
    if (adminToken) await call('PATCH', `/admin/staff/${(await admin.auth.admin.listUsers({page:1,perPage:1000})).data.users.find(user=>String(user.phone || '').replace(/\D/g, '')===phone1.replace(/\D/g, ''))?.id}/deactivate`, undefined, adminToken, 200).catch(() => {process.exitCode = 1;});
    await admin.auth.admin.deleteUser(adminId);
  }
}
main().catch(error => {console.error(`FAIL: ${error.message}`); process.exitCode = 1;});
