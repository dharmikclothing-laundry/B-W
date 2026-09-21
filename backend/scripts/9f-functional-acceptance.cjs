/* Fictional 9F acceptance. Uses local Supabase, local OTP and mock refunds only. */
const fs = require('fs');
const path = require('path');
const {randomUUID} = require('crypto');
require('dotenv').config({path: path.join(__dirname, '..', '.env'), quiet: true});
const {createClient} = require('@supabase/supabase-js');
const local = value => {try {return ['localhost', '127.0.0.1', '::1'].includes(new URL(value).hostname);} catch {return false;}};
if (!local(process.env.SUPABASE_URL) || process.env.NODE_ENV === 'production' || process.env.RAZORPAY_MODE !== 'mock' || process.env.GOOGLE_MAPS_MODE !== 'mock')
  throw new Error('9F requires local Supabase and mock providers');
const config = fs.readFileSync(path.join(__dirname, '..', 'supabase/config.toml'), 'utf8');
const otp = config.match(/^16505550106\s*=\s*"(\d+)"/m)?.[1];
if (!otp) throw new Error('Fictional Admin local OTP unavailable');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY, {auth: {persistSession: false}});
const api = 'http://127.0.0.1:3001/v1';
async function call(method, route, token, expected, body) {
  const response = await fetch(`${api}${route}`, {method, headers: {...(token ? {authorization: `Bearer ${token}`} : {}), ...(body ? {'content-type': 'application/json'} : {})}, ...(body ? {body: JSON.stringify(body)} : {})});
  if (response.status !== expected) throw new Error(`${method} ${route}: expected ${expected}, got ${response.status}`);
  return response.json().catch(() => ({}));
}
async function one(label, query) {const {data, error} = await query; if (error || !data) throw new Error(`${label}: ${error?.message || 'missing'}`); return data;}
async function main() {
  await call('GET', '/admin/issues', null, 401);
  const phone = '+16505550106';
  await call('POST', '/auth/phone/request-otp', null, 201, {phone});
  const login = await call('POST', '/auth/phone/verify-otp', null, 201, {phone, token: otp});
  const token = login.session?.access_token;
  if (!token || login.profile?.accountRole !== 'admin') throw new Error('Fictional Admin login failed');
  const payments = await one('Local mock paid payments', db.from('payment_orders').select('id,order_id,amount,provider_payment_id,refund_requests(id,amount,status)')
    .eq('provider', 'mock').eq('status', 'paid').order('created_at', {ascending: false}).limit(20));
  const payment = payments.find(row => row.provider_payment_id?.startsWith('mock_payment_') && Number(row.amount) >= 1 && !(row.refund_requests || []).length);
  if (!payment) throw new Error('No eligible local mock payment for fictional 9F acceptance');
  const order = await one('Local customer order', db.from('orders').select('id,customer_id,order_number,current_status').eq('id', payment.order_id).single());
  const customer = await one('Customer profile', db.from('customers').select('profile_id').eq('id', order.customer_id).single());
  const other = await one('Wrong order', db.from('orders').select('id').neq('id', order.id).limit(1).single());
  const beforePayment = await one('Captured payment snapshot', db.from('payment_orders').select('id,amount,provider_payment_id,paid_at').eq('id', payment.id).single());
  const claim = await one('Fictional claim', db.from('customer_order_claims').insert({order_id: order.id, customer_id: order.customer_id,
    submitted_by: customer.profile_id, client_request_id: randomUUID(), claim_type: 'other', description: 'Fictional local 9F Admin decision test'}).select('id').single());
  const photoPath = `${order.id}/${claim.id}/9f-evidence.png`;
  const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl4QXgAAAAASUVORK5CYII=', 'base64');
  const uploaded = await db.storage.from('customer-claim-photos').upload(photoPath, tinyPng, {contentType: 'image/png', upsert: false});
  if (uploaded.error) throw new Error(`Local evidence upload failed: ${uploaded.error.message}`);
  await one('Claim evidence row', db.from('customer_claim_photos').insert({claim_id: claim.id, storage_path: photoPath, uploaded_by: customer.profile_id}).select('id').single());
  const queue = await call('GET', '/admin/issues', token, 200);
  if (!queue.claims.some(row => row.id === claim.id)) throw new Error('Admin claim queue omitted fictional claim');
  const detail = await call('GET', `/admin/issues/orders/${order.id}`, token, 200);
  if (!detail.claims.some(row => row.id === claim.id && row.customer_claim_photos?.[0]?.signedUrl)) throw new Error('Admin claim evidence unavailable');
  await call('POST', `/admin/issues/orders/${other.id}/claims/${claim.id}/decision`, token, 404, {status: 'under_review', notes: 'Wrong order'});
  await call('POST', `/admin/issues/orders/${order.id}/claims/${claim.id}/decision`, token, 201, {status: 'under_review', notes: 'Evidence reviewed'});
  await call('POST', `/admin/issues/orders/${order.id}/claims/${claim.id}/decision`, token, 201, {status: 'approved', notes: 'Fictional approval'});
  await call('POST', `/admin/issues/orders/${order.id}/claims/${claim.id}/decision`, token, 201, {status: 'resolved', notes: 'Fictional resolution'});
  await call('POST', `/admin/issues/orders/${order.id}/claims/${claim.id}/decision`, token, 409, {status: 'resolved', notes: 'Duplicate resolution'});
  console.log('PASS: Admin queue, signed local evidence, wrong-order denial, atomic claim transitions and duplicate rejection');
  await call('POST', `/admin/issues/orders/${order.id}/payments/${payment.id}/refunds`, token, 400, {amount: -1, reason: 'Invalid amount'});
  await call('POST', `/admin/issues/orders/${other.id}/payments/${payment.id}/refunds`, token, 404, {amount: 0.01, reason: 'Wrong order'});
  const rejected = await call('POST', `/admin/issues/orders/${order.id}/payments/${payment.id}/refunds`, token, 201, {amount: 0.01, reason: 'Fictional rejected request'});
  if (!rejected.id) throw new Error('Mock refund request missing ID');
  await call('POST', `/admin/issues/orders/${order.id}/refunds/${rejected.id}/reject`, token, 201, {notes: 'Fictional rejection'});
  await call('POST', `/admin/issues/orders/${order.id}/refunds/${rejected.id}/reject`, token, 409, {notes: 'Duplicate rejection'});
  const approved = await call('POST', `/admin/issues/orders/${order.id}/payments/${payment.id}/refunds`, token, 201, {amount: 0.01, reason: 'Fictional approved request'});
  await call('POST', `/admin/issues/orders/${other.id}/refunds/${approved.id}/approve`, token, 404, {notes: 'Wrong order'});
  const completion = await call('POST', `/admin/issues/orders/${order.id}/refunds/${approved.id}/approve`, token, 201, {notes: 'Fictional approval'});
  if (!['completed','processing'].includes(completion.status)) throw new Error('Mock refund did not process');
  const replay = await call('POST', `/admin/issues/orders/${order.id}/refunds/${approved.id}/approve`, token, 201, {notes: 'Duplicate approval'});
  if (!replay.duplicate) throw new Error('Duplicate refund execution was not blocked');
  const afterPayment = await one('Captured payment snapshot', db.from('payment_orders').select('id,amount,provider_payment_id,paid_at').eq('id', payment.id).single());
  if (JSON.stringify(afterPayment) !== JSON.stringify(beforePayment)) throw new Error('Captured payment history changed');
  const audit = await one('Decision audit', db.from('admin_issue_decision_audit').select('action').eq('order_id', order.id));
  for (const action of ['claim_review','claim_approve','claim_resolve','refund_request','refund_reject','refund_approve'])
    if (!audit.some(row => row.action === action)) throw new Error(`Missing ${action} audit`);
  const notices = await one('Customer notifications', db.from('notifications').select('notification_type').eq('order_id', order.id).eq('profile_id', customer.profile_id));
  if (!notices.some(row => row.notification_type === 'claim.resolved') || !notices.some(row => row.notification_type === 'refund.approved'))
    throw new Error('Customer claim/refund updates were not queued');
  console.log('PASS: mock refund amount, wrong-order, reject, approve, duplicate execution, captured-payment immutability, audit and customer updates');
  console.log('PASS: local Supabase and mock provider only; no Production traffic');
}
main().catch(error => {console.error(`FAIL: ${error.message}`); process.exitCode = 1;});
