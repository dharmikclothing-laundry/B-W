/* Local-only fictional 9D assignment acceptance. Leaves immutable audit fixtures in local Supabase. */
const fs = require('fs');
const path = require('path');
require('dotenv').config({path: path.join(__dirname, '..', '.env'), quiet: true});
const {createClient} = require('@supabase/supabase-js');
const local = value => {try {return ['localhost', '127.0.0.1', '::1'].includes(new URL(value).hostname);} catch {return false;}};
if (!local(process.env.SUPABASE_URL) || process.env.NODE_ENV === 'production' ||
    process.env.RAZORPAY_MODE !== 'mock' || process.env.GOOGLE_MAPS_MODE !== 'mock')
  throw new Error('9D requires local Supabase and mock providers');
const config = fs.readFileSync(path.join(__dirname, '..', 'supabase/config.toml'), 'utf8');
const otp = config.match(/^16505550106\s*=\s*"(\d+)"/m)?.[1];
if (!otp) throw new Error('Fictional Admin local OTP missing');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY, {auth: {persistSession: false}});
const auth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY, {auth: {persistSession: false}});
const api = 'http://127.0.0.1:3001/v1';
const digits = value => String(value ?? '').replace(/\D/g, '');
async function one(label, query) {const {data, error} = await query; if (error || !data) throw new Error(`${label}: ${error?.message || 'missing'}`); return data;}
async function call(method, route, token, expected, body) {
  const response = await fetch(`${api}${route}`, {method, headers: {...(token ? {authorization: `Bearer ${token}`} : {}), ...(body ? {'content-type': 'application/json'} : {})}, ...(body ? {body: JSON.stringify(body)} : {})});
  if (response.status !== expected) throw new Error(`${method} ${route}: expected ${expected}, got ${response.status}`);
  return response.json().catch(() => ({}));
}
async function driverToken(profileId) {
  const email = `bw-9d-driver-${profileId.slice(0, 8)}@example.test`;
  const update = await db.auth.admin.updateUserById(profileId, {email, email_confirm: true});
  if (update.error) throw new Error('Fictional Driver email fixture failed');
  const link = await db.auth.admin.generateLink({type: 'magiclink', email});
  const session = await auth.auth.verifyOtp({token_hash: link.data?.properties?.hashed_token, type: 'magiclink'});
  if (!session.data?.session?.access_token) throw new Error('Fictional Driver session failed');
  return session.data.session.access_token;
}
async function main() {
  const adminPhone = '+16505550106';
  const users = await db.auth.admin.listUsers({page: 1, perPage: 1000});
  if (users.error) throw new Error('Local fictional identities unavailable');
  const admin = users.data.users.find(user => digits(user.phone) === digits(adminPhone));
  if (!admin || admin.user_metadata?.bw_9c_fixture !== true) throw new Error('9C fictional Admin unavailable');
  const phones = ['+16505550102', '+16505550107'];
  const identities = phones.map(phone => users.data.users.find(user => digits(user.phone) === digits(phone)));
  if (identities.some(user => !user?.user_metadata?.bw_staff_provisioning)) throw new Error('Admin-provisioned fictional Drivers unavailable');
  await call('POST', '/auth/phone/request-otp', null, 201, {phone: adminPhone});
  const signed = await call('POST', '/auth/phone/verify-otp', null, 201, {phone: adminPhone, token: otp});
  const adminToken = signed.session?.access_token;
  if (!adminToken || signed.profile?.accountRole !== 'admin') throw new Error('Admin OTP login failed');
  await call('GET', '/admin/assignments', null, 401);
  const drivers = [];
  try {
    for (const user of identities) {
      await call('PATCH', `/admin/staff/${user.id}/activate`, adminToken, 200);
      const driver = await one('Driver', db.from('drivers').select('id').eq('profile_id', user.id).single());
      await one('Driver availability', db.from('drivers').update({is_available: true}).eq('id', driver.id).select('id').single());
      drivers.push({profileId: user.id, id: driver.id, token: await driverToken(user.id)});
    }
    await call('GET', '/admin/assignments', drivers[0].token, 403);
    console.log('PASS: anonymous and Driver access to Admin operations blocked');
    const source = await one('Order template', db.from('orders').select('customer_id,facility_id,pickup_address_id,delivery_address_id').eq('current_status', 'confirmed').limit(1).single());
    const order = await one('Fictional order', db.from('orders').insert({order_number: `BW-9D-${Date.now()}`, customer_id: source.customer_id, facility_id: source.facility_id, pickup_address_id: source.pickup_address_id, delivery_address_id: source.delivery_address_id, current_status: 'draft'}).select('id').single());
    const moved = await db.rpc('change_order_status', {p_order_id: order.id, p_new_status: 'confirmed', p_reason: '9D fictional local acceptance'});
    if (moved.error) throw new Error(`Fictional order transition failed: ${moved.error.message}`);
    const overview = await call('GET', '/admin/assignments', adminToken, 200);
    if (!overview.jobs.some(job => job.orderId === order.id && job.canAssign)) throw new Error('Unassigned fictional job missing');
    if (!overview.drivers.some(row => row.id === drivers[0].id && row.isAvailable)) throw new Error('Available Driver missing');
    console.log('PASS: unassigned queue and Driver availability visible');
    const assignment = await call('POST', `/admin/assignments/orders/${order.id}/assign`, adminToken, 201, {driverId: drivers[0].id, type: 'pickup'});
    const oldId = assignment.assignment.id;
    await call('POST', `/admin/assignments/orders/${order.id}/assign`, adminToken, 409, {driverId: drivers[1].id, type: 'pickup'});
    await call('GET', `/drivers/me/assignments/${oldId}`, drivers[0].token, 200);
    await call('GET', `/drivers/me/assignments/${oldId}`, drivers[1].token, 404);
    console.log('PASS: atomic assignment, duplicate blocked and assignment isolation');
    const replacement = await call('POST', `/admin/assignments/${oldId}/reassign`, adminToken, 201, {driverId: drivers[1].id});
    const newId = replacement.assignment.id;
    await call('GET', `/drivers/me/assignments/${oldId}`, drivers[0].token, 404);
    await call('GET', `/drivers/me/assignments/${newId}`, drivers[1].token, 200);
    await call('POST', `/admin/assignments/${oldId}/reassign`, adminToken, 409, {driverId: drivers[0].id});
    await call('POST', `/admin/assignments/${newId}/reassign`, drivers[0].token, 403, {driverId: drivers[0].id});
    const detail = await call('GET', `/admin/assignments/orders/${order.id}`, adminToken, 200);
    if (detail.assignments.length !== 2 || detail.audit.length !== 2 || detail.assignments[1].status !== 'reassignment_required')
      throw new Error('Assignment history or Admin audit incomplete');
    const current = await one('Order lifecycle', db.from('orders').select('current_status').eq('id', order.id).single());
    if (current.current_status !== 'pickup_assigned') throw new Error('Order lifecycle diverged');
    console.log('PASS: reassignment atomically revoked old access, granted new access, blocked stale/Driver requests, retained history/audit and approved order status');
    await call('POST', `/driver-assignments/${newId}/accept`, drivers[1].token, 201);
    await call('POST', `/driver-assignments/${newId}/accept`, drivers[1].token, 409);
    console.log('PASS: new Driver accepts once; duplicate decision blocked');
  } finally {
    for (const user of identities) await call('PATCH', `/admin/staff/${user.id}/deactivate`, adminToken, 200).catch(() => {process.exitCode = 1;});
  }
}
main().catch(error => {console.error(`FAIL: ${error.message}`); process.exitCode = 1;});
