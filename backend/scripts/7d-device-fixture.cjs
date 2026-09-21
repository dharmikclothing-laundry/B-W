/* Reproducible fictional fixture for physical 7D Development acceptance. */
const fs = require('fs');
const path = require('path');
require('dotenv').config({path: path.join(__dirname, '..', '.env'), quiet: true});
const {createClient} = require('@supabase/supabase-js');
const localHost = value => {try {return ['localhost', '127.0.0.1', '::1'].includes(new URL(value).hostname);} catch {return false;}};
if (!localHost(process.env.SUPABASE_URL) || process.env.NODE_ENV === 'production' ||
    process.env.GOOGLE_MAPS_MODE !== 'mock' || process.env.RAZORPAY_MODE !== 'mock') {
  throw new Error('7D device fixture requires local Supabase and mock providers');
}
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY, {auth: {persistSession: false}});
const publicAuth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY, {auth: {persistSession: false}});
const statePath = '/private/tmp/bw-7d-device-fixture.json';
const api = 'http://127.0.0.1:3000/v1';
async function one(label, query) {const result = await query; if (result.error || !result.data) throw new Error(`${label} unavailable (${result.error?.code || 'empty'})`); return result.data;}
async function call(method, route, body, token, expected) {
  const response = await fetch(`${api}${route}`, {method, headers: {...(body ? {'content-type': 'application/json'} : {}), ...(token ? {authorization: `Bearer ${token}`} : {})}, ...(body ? {body: JSON.stringify(body)} : {})});
  if (response.status !== expected) throw new Error(`${route}: expected ${expected}, got ${response.status}`);
  return response.json().catch(() => ({}));
}
const samePhone = (left, right) => String(left || '').replace(/\D/g, '') === right.replace(/\D/g, '');

async function cleanup(record) {
  if (record.orderId) {
    const navigation = await admin.from('driver_navigation_events').delete().eq('order_id', record.orderId);
    if (navigation.error) throw new Error(`Fixture navigation cleanup failed (${navigation.error.code})`);
    const deleted = await admin.from('orders').delete().eq('id', record.orderId);
    if (deleted.error) throw new Error(`Fixture order cleanup failed (${deleted.error.code})`);
  }
  if (record.driverId && record.driverBefore) {
    const driver = await admin.from('drivers').update(record.driverBefore).eq('id', record.driverId);
    if (driver.error) throw new Error(`Fixture Driver cleanup failed (${driver.error.code})`);
  }
  if (record.driverProfileId && record.profileBefore) {
    const profile = await admin.from('profiles').update(record.profileBefore).eq('id', record.driverProfileId);
    if (profile.error) throw new Error(`Fixture Driver profile cleanup failed (${profile.error.code})`);
  }
  if (record.adminId) await admin.auth.admin.deleteUser(record.adminId);
  if (fs.existsSync(statePath)) fs.unlinkSync(statePath);
  console.log('PASS: fictional 7D device fixture removed from local Supabase');
}

async function reactivate(record) {
  const adminUser = await admin.auth.admin.getUserById(record.adminId);
  if (adminUser.error || !adminUser.data.user?.email) throw new Error('Local fixture Admin unavailable');
  const link = await admin.auth.admin.generateLink({type: 'magiclink', email: adminUser.data.user.email});
  const session = await publicAuth.auth.verifyOtp({token_hash: link.data?.properties?.hashed_token, type: 'magiclink'});
  if (!session.data?.session?.access_token) throw new Error('Local fixture Admin login failed');
  await call('PATCH', `/admin/staff/${record.driverProfileId}/activate`, undefined, session.data.session.access_token, 200);
  console.log('PASS: fictional Development Driver reactivated through Admin API');
}

async function arrive(record) {
  const config = fs.readFileSync(path.join(__dirname, '..', 'supabase/config.toml'), 'utf8');
  const token = config.match(/^16505550102\s*=\s*"(\d+)"/m)?.[1];
  if (!token) throw new Error('Fictional local Driver OTP unavailable');
  await call('POST', '/auth/phone/request-otp', {phone: '+16505550102'}, undefined, 201);
  const login = await call('POST', '/auth/phone/verify-otp', {phone: '+16505550102', token}, undefined, 201);
  if (!login.session?.access_token) throw new Error('Fictional Driver login failed');
  await call('POST', `/driver-assignments/${record.assignmentId}/arrive`, undefined, login.session.access_token, 201);
  console.log('PASS: fictional local pickup marked arrived through approved Driver transition');
}

async function prepare() {
  if (fs.existsSync(statePath)) throw new Error('A 7D device fixture is already active; clean it up first');
  const record = {};
  try {
    const email = `bw-7d-device-admin-${Date.now()}@example.test`;
    const created = await admin.auth.admin.createUser({email, email_confirm: true, user_metadata: {full_name: '7D Local Admin'}});
    if (created.error || !created.data.user) throw new Error('Local Admin creation failed');
    record.adminId = created.data.user.id;
    const role = await one('Admin role', admin.from('roles').select('id').eq('code', 'admin').single());
    await one('Admin permission', admin.from('profile_roles').insert({profile_id: record.adminId, role_id: role.id}).select('profile_id').single());
    const link = await admin.auth.admin.generateLink({type: 'magiclink', email});
    const session = await publicAuth.auth.verifyOtp({token_hash: link.data?.properties?.hashed_token, type: 'magiclink'});
    const adminToken = session.data?.session?.access_token;
    if (!adminToken) throw new Error('Local Admin login failed');
    const users = await admin.auth.admin.listUsers({page: 1, perPage: 1000});
    if (users.error) throw new Error('Local fixture users unavailable');
    const driver = users.data.users.find(user => samePhone(user.phone, '+16505550102'));
    const customer = users.data.users.find(user => samePhone(user.phone, '+16505550101'));
    if (!driver?.user_metadata?.bw_staff_provisioning || !customer) throw new Error('Fictional Driver or customer fixture missing');
    record.driverProfileId = driver.id;
    await call('PATCH', `/admin/staff/${driver.id}/activate`, undefined, adminToken, 200);
    const driverRow = await one('Driver', admin.from('drivers').select('id,is_active,is_available').eq('profile_id', driver.id).single());
    record.driverId = driverRow.id;
    record.driverBefore = {is_active: driverRow.is_active, is_available: driverRow.is_available};
    const profileRow = await one('Driver profile', admin.from('profiles').select('is_active').eq('id', driver.id).single());
    record.profileBefore = {is_active: profileRow.is_active};
    const customerRow = await one('Customer', admin.from('customers').select('id').eq('profile_id', customer.id).single());
    const sources = await one('source orders', admin.from('orders').select('facility_id,pickup_address_id,delivery_address_id').eq('current_status', 'confirmed').not('pickup_address_id', 'is', null).limit(100));
    let source, address;
    for (const candidate of sources) {
      const found = await admin.from('customer_addresses').select('latitude,longitude').eq('id', candidate.pickup_address_id).maybeSingle();
      if (!found.error && found.data?.latitude != null && found.data?.longitude != null) {
        source = candidate; address = found.data; break;
      }
    }
    if (!source || !address) throw new Error('Local pickup coordinates unavailable');
    const available = await admin.from('drivers').update({is_available: true}).eq('id', driverRow.id);
    if (available.error) throw new Error('Driver availability setup failed');
    const location = await admin.rpc('upsert_driver_live_location', {p_driver_id: driverRow.id, p_latitude: address.latitude, p_longitude: address.longitude, p_accuracy_m: 8});
    if (location.error) throw new Error('Local Driver location setup failed');
    const order = await one('order', admin.from('orders').insert({order_number: `BW-7D-DEVICE-${Date.now()}`, customer_id: customerRow.id, facility_id: source.facility_id, pickup_address_id: source.pickup_address_id, delivery_address_id: source.delivery_address_id, current_status: 'draft'}).select('id').single());
    record.orderId = order.id;
    const transition = await admin.rpc('change_order_status', {p_order_id: order.id, p_new_status: 'confirmed', p_reason: '7D local device fixture'});
    if (transition.error) throw new Error('Approved local order transition failed');
    const assigned = await call('POST', `/orders/${order.id}/assign-driver`, {assignmentType: 'pickup'}, adminToken, 201);
    record.assignmentId = assigned.assignment?.id;
    if (!record.assignmentId || assigned.assignment.driver_id !== driverRow.id) throw new Error('Admin assignment chose an unexpected Driver');
    fs.writeFileSync(statePath, JSON.stringify(record), {mode: 0o600});
    console.log('PASS: Admin assigned fictional pickup for 7D device acceptance');
    console.log(`Fixture order: ${order.id.slice(0, 8)}; Driver: fictional Development account`);
  } catch (error) {await cleanup(record); throw error;}
}

const mode = process.argv[2];
(async () => {
  if (mode === 'prepare') await prepare();
  else if (mode === 'cleanup') await cleanup(JSON.parse(fs.readFileSync(statePath, 'utf8')));
  else if (mode === 'reactivate') await reactivate(JSON.parse(fs.readFileSync(statePath, 'utf8')));
  else if (mode === 'arrive') await arrive(JSON.parse(fs.readFileSync(statePath, 'utf8')));
  else throw new Error('Usage: node scripts/7d-device-fixture.cjs prepare|reactivate|arrive|cleanup');
})().catch(error => {console.error(`FAIL: ${error.message}`); process.exitCode = 1;});
