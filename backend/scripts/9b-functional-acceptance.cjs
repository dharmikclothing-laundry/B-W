/* Fictional local-only Admin/customer/order acceptance; no external provider calls. */
const fs = require('fs');
const path = require('path');
require('dotenv').config({path: path.join(__dirname, '..', '.env'), quiet: true});
const {createClient} = require('@supabase/supabase-js');
const local = value => {try {return ['localhost', '127.0.0.1', '::1'].includes(new URL(value).hostname);} catch {return false;}};
if (!local(process.env.SUPABASE_URL) || process.env.NODE_ENV === 'production' ||
    process.env.RAZORPAY_MODE !== 'mock' || process.env.GOOGLE_MAPS_MODE !== 'mock') {
  throw new Error('9B functional acceptance requires local Supabase and mock providers');
}
const config = fs.readFileSync(path.join(__dirname, '..', 'supabase/config.toml'), 'utf8');
const otp = config.match(/^16505550106\s*=\s*"(\d+)"/m)?.[1];
if (!otp) throw new Error('Fictional local Admin OTP unavailable');
const db = createClient(process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  {auth: {persistSession: false}});
const api = 'http://127.0.0.1:3001/v1';
async function one(label, query) {
  const {data, error} = await query;
  if (error || !data) throw new Error(`${label} failed: ${error?.message ?? 'missing row'}`);
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
  const customerPhone = '+16505550108';
  const existing = await db.auth.admin.listUsers({page: 1, perPage: 1000});
  if (existing.error || existing.data.users.some(user => [adminPhone, customerPhone].includes(user.phone)))
    throw new Error('9B fictional phones unavailable; no existing identity will be modified');
  const created = [];
  let orderId;
  try {
    for (const [phone, name] of [[adminPhone, '9B Fictional Admin'], [customerPhone, '9B Fictional Customer']]) {
      const result = await db.auth.admin.createUser({phone, phone_confirm: true, user_metadata: {full_name: name, bw_9b_fixture: true}});
      if (result.error || !result.data.user) throw new Error('Fictional local user creation failed');
      created.push(result.data.user.id);
    }
    const [adminId, customerProfileId] = created;
    const adminRole = await one('Admin role', db.from('roles').select('id').eq('code', 'admin').single());
    await one('Admin role assignment', db.from('profile_roles').insert({profile_id: adminId, role_id: adminRole.id}).select('profile_id').single());
    const customer = await one('Fictional customer', db.from('customers').insert({profile_id: customerProfileId, referral_code: `BW9B${Date.now()}`}).select('id').single());
    const placed = await one('Fictional order', db.from('orders').insert({order_number: `BW-9B-${Date.now()}`, customer_id: customer.id, current_status: 'draft', subtotal: 100, total_amount: 100}).select('id').single());
    orderId = placed.id;
    await one('Fictional garment', db.from('order_items').insert({order_id: orderId, item_name: 'Fictional test shirt', quantity: 1, unit_price: 100, line_total: 100}).select('id').single());
    await one('Fictional QR', db.from('order_qr_codes').insert({order_id: orderId}).select('id').single());
    await call('GET', '/admin/customers', null, 401);
    await call('POST', `/admin/orders/${orderId}/cancel`, null, 401, {reason: 'Fictional test cancellation'});
    console.log('PASS: anonymous Admin customer and cancellation routes blocked');
    await call('POST', '/auth/phone/request-otp', null, 201, {phone: adminPhone});
    const login = await call('POST', '/auth/phone/verify-otp', null, 201, {phone: adminPhone, token: otp});
    const token = login.session?.access_token;
    if (!token || login.profile?.accountRole !== 'admin') throw new Error('Privileged Admin login failed');
    const list = await call('GET', '/admin/customers?search=9B%20Fictional%20Customer', token, 200);
    if (!Array.isArray(list) || !list.some(row => row.id === customer.id)) throw new Error('Customer search did not return fixture');
    const profile = await call('GET', `/admin/customers/${customer.id}`, token, 200);
    if (profile.id !== customer.id || !Array.isArray(profile.customer_addresses)) throw new Error('Admin customer profile incomplete');
    const history = await call('GET', `/admin/customers/${customer.id}/orders`, token, 200);
    if (!history.some(row => row.id === orderId)) throw new Error('Admin customer order history incomplete');
    const detail = await call('GET', `/admin/orders/${orderId}`, token, 200);
    if (detail.order?.id !== orderId || detail.order?.order_items?.length !== 1 || !detail.order?.order_qr_codes?.secure_token ||
        !Array.isArray(detail.payments) || !Array.isArray(detail.claims)) throw new Error('Admin order aggregate incomplete');
    console.log('PASS: Admin search, profile/contact, history, garment, QR, payment and claims aggregate');
    const lookup = await call('POST', '/qr/scan', token, 201, {token: detail.order.order_qr_codes.secure_token, action: 'lookup'});
    if (lookup.orderId !== orderId) throw new Error('Admin QR lookup returned the wrong order');
    console.log('PASS: audited Admin QR handoff lookup resolves the correct order');
    const result = await call('POST', `/admin/orders/${orderId}/cancel`, token, 201, {reason: 'Fictional test cancellation'});
    if (result.orderStatus !== 'cancelled') throw new Error('Admin cancellation did not complete');
    await call('POST', `/admin/orders/${orderId}/cancel`, token, 409, {reason: 'Duplicate cancellation'});
    const audit = await one('Cancellation audit', db.from('order_status_history').select('changed_by,reason').eq('order_id', orderId).eq('to_status', 'cancelled').single());
    if (audit.changed_by !== adminId || !audit.reason.startsWith('Admin cancellation:')) throw new Error('Admin cancellation audit actor incorrect');
    console.log('PASS: atomic Admin cancellation, duplicate rejection and Admin audit attribution');
  } finally {
    if (orderId) {
      const deleted = await db.from('orders').delete().eq('id', orderId);
      if (deleted.error) throw new Error('Fictional order cleanup failed');
    }
    for (const id of created.reverse()) {
      const deleted = await db.auth.admin.deleteUser(id);
      if (deleted.error) throw new Error('Fictional identity cleanup failed');
    }
  }
}
main().catch(error => {console.error(`FAIL: ${error.message}`); process.exitCode = 1;});
