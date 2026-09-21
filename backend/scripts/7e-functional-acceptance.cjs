/* Fictional local-only 7E pickup handover acceptance. */
const fs = require('fs');
const path = require('path');
require('dotenv').config({path: path.join(__dirname, '..', '.env'), quiet: true});
const {createClient} = require('@supabase/supabase-js');
const local = value => {try {return ['localhost', '127.0.0.1', '::1'].includes(new URL(value).hostname);} catch {return false;}};
if (!local(process.env.SUPABASE_URL) || process.env.NODE_ENV === 'production' ||
    process.env.GOOGLE_MAPS_MODE !== 'mock' || process.env.RAZORPAY_MODE !== 'mock') {
  throw new Error('7E acceptance requires local Supabase and mock providers');
}
const config = fs.readFileSync(path.join(__dirname, '..', 'supabase/config.toml'), 'utf8');
const otp = phone => config.match(new RegExp(`^${phone.replace('+', '')}\\s*=\\s*"(\\d+)"`, 'm'))?.[1];
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY, {auth: {persistSession: false}});
const publicAuth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY, {auth: {persistSession: false}});
const api = 'http://127.0.0.1:3001/v1';
const samePhone = (left, right) => String(left || '').replace(/\D/g, '') === right.replace(/\D/g, '');
async function one(label, query) {const result = await query; if (result.error || !result.data) throw new Error(`${label} unavailable (${result.error?.code || 'empty'})`); return result.data;}
async function call(method, route, body, token, expected) {
  const response = await fetch(`${api}${route}`, {method, headers: {...(body ? {'content-type': 'application/json'} : {}), ...(token ? {authorization: `Bearer ${token}`} : {})}, ...(body ? {body: JSON.stringify(body)} : {})});
  if (response.status !== expected) throw new Error(`${route}: expected ${expected}, got ${response.status}`);
  return response.json().catch(() => ({}));
}
async function login(phone) {
  const code = otp(phone);
  if (!code) throw new Error('Fictional local OTP fixture missing');
  await call('POST', '/auth/phone/request-otp', {phone}, undefined, 201);
  const result = await call('POST', '/auth/phone/verify-otp', {phone, token: code}, undefined, 201);
  if (!result.session?.access_token) throw new Error('Fictional local login failed');
  return result.session.access_token;
}

async function main() {
  const adminEmail = `bw-7e-admin-${Date.now()}@example.test`;
  const created = await admin.auth.admin.createUser({email: adminEmail, email_confirm: true, user_metadata: {full_name: '7E Local Admin'}});
  if (created.error || !created.data.user) throw new Error('Local Admin fixture unavailable');
  const adminId = created.data.user.id;
  let orderId, driverProfileId, driverBefore, driverRow, wrongProfileId, wrongBefore, wrongDriverRow, adminToken;
  try {
    const adminRole = await one('Admin role', admin.from('roles').select('id').eq('code', 'admin').single());
    await one('Admin permission', admin.from('profile_roles').insert({profile_id: adminId, role_id: adminRole.id}).select('profile_id').single());
    const link = await admin.auth.admin.generateLink({type: 'magiclink', email: adminEmail});
    const session = await publicAuth.auth.verifyOtp({token_hash: link.data?.properties?.hashed_token, type: 'magiclink'});
    adminToken = session.data?.session?.access_token;
    if (!adminToken) throw new Error('Local Admin login failed');
    const users = await admin.auth.admin.listUsers({page: 1, perPage: 1000});
    if (users.error) throw new Error('Fictional users unavailable');
    const driver = users.data.users.find(user => samePhone(user.phone, '+16505550102'));
    const wrongDriver = users.data.users.find(user => samePhone(user.phone, '+16505550105'));
    const customer = users.data.users.find(user => samePhone(user.phone, '+16505550101'));
    if (!driver?.user_metadata?.bw_staff_provisioning || !wrongDriver?.user_metadata?.bw_staff_provisioning || !customer) throw new Error('Admin-provisioned fictional users missing');
    driverProfileId = driver.id; wrongProfileId = wrongDriver.id;
    driverBefore = await one('Driver profile', admin.from('profiles').select('is_active').eq('id', driver.id).single());
    wrongBefore = await one('Other Driver profile', admin.from('profiles').select('is_active').eq('id', wrongDriver.id).single());
    await call('PATCH', `/admin/staff/${driver.id}/activate`, undefined, adminToken, 200);
    await call('PATCH', `/admin/staff/${wrongDriver.id}/activate`, undefined, adminToken, 200);
    driverRow = await one('Driver row', admin.from('drivers').select('id,is_available').eq('profile_id', driver.id).single());
    wrongDriverRow = await one('Other Driver row', admin.from('drivers').select('id,is_available').eq('profile_id', wrongDriver.id).single());
    const available = await admin.from('drivers').update({is_available: true}).eq('id', driverRow.id);
    if (available.error) throw new Error(`Driver availability failed (${available.error.code})`);
    const customerRow = await one('Customer', admin.from('customers').select('id').eq('profile_id', customer.id).single());
    const source = await one('Source order', admin.from('orders').select('facility_id,pickup_address_id,delivery_address_id').eq('current_status', 'confirmed').not('pickup_address_id', 'is', null).limit(1).single());
    const order = await one('Fictional order', admin.from('orders').insert({order_number: `BW-7E-${Date.now()}`, customer_id: customerRow.id, facility_id: source.facility_id, pickup_address_id: source.pickup_address_id, delivery_address_id: source.delivery_address_id, current_status: 'draft'}).select('id').single());
    orderId = order.id;
    await one('Fictional garment', admin.from('order_items').insert({order_id: orderId, item_name: 'Fictional shirts', quantity: 2, weight_kg: 1.5, unit_price: 0, line_total: 0}).select('id').single());
    const confirmed = await admin.rpc('change_order_status', {p_order_id: orderId, p_new_status: 'confirmed', p_reason: '7E local fixture'});
    if (confirmed.error) throw new Error(`Approved confirmation failed (${confirmed.error.code})`);
    const assigned = await one('Pickup assignment', admin.rpc('create_driver_assignment_atomic', {p_order_id: orderId, p_driver_id: driverRow.id, p_assignment_type: 'pickup', p_assignment_score: 0}));
    const assignmentId = assigned.assignment.id;
    const driverToken = await login('+16505550102');
    const customerToken = await login('+16505550101');
    const wrongEmail = wrongDriver.email || `bw-7e-other-${Date.now()}@example.test`;
    if (!wrongDriver.email) {
      const updated = await admin.auth.admin.updateUserById(wrongDriver.id, {email: wrongEmail, email_confirm: true});
      if (updated.error) throw new Error('Other Driver local email setup failed');
    }
    const wrongLink = await admin.auth.admin.generateLink({type: 'magiclink', email: wrongEmail});
    const wrongSession = await publicAuth.auth.verifyOtp({token_hash: wrongLink.data?.properties?.hashed_token, type: 'magiclink'});
    const wrongToken = wrongSession.data?.session?.access_token;
    if (!wrongToken) throw new Error('Other Driver login failed');
    await call('POST', `/driver-assignments/${assignmentId}/accept`, undefined, driverToken, 201);
    await call('POST', `/driver-assignments/${assignmentId}/navigation`, undefined, driverToken, 201);
    await call('POST', `/driver-assignments/${assignmentId}/arrive`, undefined, driverToken, 201);
    const job = await call('GET', `/drivers/me/assignments/${assignmentId}`, undefined, driverToken, 200);
    if (job.orderStatus !== 'pickup_otp_pending' || job.assignmentStatus !== 'arrived' || job.items?.[0]?.item_name !== 'Fictional shirts') throw new Error('Handover job or existing item details unavailable');
    console.log('PASS: Driver reaches pickup handover and sees existing garment details');
    await call('GET', `/drivers/me/assignments/${assignmentId}`, undefined, wrongToken, 404);
    const issued = await call('POST', `/orders/${orderId}/otp`, {otpType: 'pickup'}, customerToken, 201);
    await call('POST', `/orders/${orderId}/otp/verify`, {otpType: 'pickup', otp: issued.otp}, wrongToken, 403);
    await call('POST', `/orders/${orderId}/otp/verify`, {otpType: 'pickup', otp: '000000'}, driverToken, 400);
    const expired = await admin.from('order_otps').update({expires_at: new Date(Date.now() - 60_000).toISOString()}).eq('id', issued.otpId);
    if (expired.error) throw new Error(`Local expiry setup failed (${expired.error.code})`);
    await call('POST', `/orders/${orderId}/otp/verify`, {otpType: 'pickup', otp: issued.otp}, driverToken, 400);
    console.log('PASS: wrong Driver, invalid OTP, and expired OTP rejected');
    const refreshed = await call('POST', `/orders/${orderId}/otp`, {otpType: 'pickup'}, customerToken, 201);
    const verified = await call('POST', `/orders/${orderId}/otp/verify`, {otpType: 'pickup', otp: refreshed.otp}, driverToken, 201);
    if (!verified.verified || verified.orderStatus !== 'picked_up') throw new Error('Atomic pickup completion failed');
    await call('POST', `/orders/${orderId}/otp/verify`, {otpType: 'pickup', otp: refreshed.otp}, driverToken, 409);
    const customerOrder = await call('GET', `/orders/${orderId}`, undefined, customerToken, 200);
    const nextJob = await call('GET', `/drivers/me/assignments/${assignmentId}`, undefined, driverToken, 200);
    const dashboard = await call('GET', '/drivers/me/dashboard', undefined, driverToken, 200);
    if (customerOrder.current_status !== 'picked_up' || nextJob.orderStatus !== 'picked_up' ||
        !dashboard.pickups?.some(job => job.id === assignmentId)) throw new Error('Customer or Driver pickup state did not refresh');
    console.log('PASS: atomic OTP completes pickup once; customer and Driver see picked-up state');
  } finally {
    if (orderId) {
      const navigation = await admin.from('driver_navigation_events').delete().eq('order_id', orderId);
      const deleted = navigation.error ? null : await admin.from('orders').delete().eq('id', orderId);
      if (navigation.error || deleted?.error) {console.error(`FAIL: fictional order cleanup failed (${navigation.error?.code || deleted?.error?.code})`); process.exitCode = 1;}
    }
    for (const row of [driverRow, wrongDriverRow]) if (row) {
      const restored = await admin.from('drivers').update({is_available: row.is_available}).eq('id', row.id);
      if (restored.error) process.exitCode = 1;
    }
    for (const [profileId, before] of [[driverProfileId, driverBefore], [wrongProfileId, wrongBefore]]) {
      if (profileId && before && adminToken) await call('PATCH', `/admin/staff/${profileId}/${before.is_active ? 'activate' : 'deactivate'}`, undefined, adminToken, 200).catch(() => {process.exitCode = 1;});
    }
    await admin.auth.admin.deleteUser(adminId);
  }
}
main().catch(error => {console.error(`FAIL: ${error.message}`); process.exitCode = 1;});
