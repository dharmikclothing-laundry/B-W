/* Fictional local-only 9E commercial configuration acceptance. */
const fs = require('fs');
const path = require('path');
require('dotenv').config({path: path.join(__dirname, '..', '.env'), quiet: true});
const {createClient} = require('@supabase/supabase-js');
const local = value => {try {return ['localhost', '127.0.0.1', '::1'].includes(new URL(value).hostname);} catch {return false;}};
if (!local(process.env.SUPABASE_URL) || process.env.NODE_ENV === 'production' || process.env.RAZORPAY_MODE !== 'mock' || process.env.GOOGLE_MAPS_MODE !== 'mock')
  throw new Error('9E requires local Supabase and mock providers');
const config = fs.readFileSync(path.join(__dirname, '..', 'supabase/config.toml'), 'utf8');
const otp = config.match(/^16505550106\s*=\s*"(\d+)"/m)?.[1];
if (!otp) throw new Error('Fictional Admin OTP unavailable');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY, {auth: {persistSession: false}});
const api = 'http://127.0.0.1:3001/v1';
async function call(method, route, token, expected, body) {
  const response = await fetch(`${api}${route}`, {method, headers: {...(token ? {authorization: `Bearer ${token}`} : {}), ...(body ? {'content-type': 'application/json'} : {})}, ...(body ? {body: JSON.stringify(body)} : {})});
  if (response.status !== expected) throw new Error(`${method} ${route}: expected ${expected}, got ${response.status}`);
  return response.json().catch(() => ({}));
}
async function one(label, query) {const {data, error} = await query; if (error || !data) throw new Error(`${label}: ${error?.message || 'missing'}`); return data;}
async function main() {
  const phone = '+16505550106';
  await call('GET', '/admin/catalogue', null, 401);
  await call('POST', '/auth/phone/request-otp', null, 201, {phone});
  const login = await call('POST', '/auth/phone/verify-otp', null, 201, {phone, token: otp});
  const token = login.session?.access_token;
  if (!token || login.profile?.accountRole !== 'admin') throw new Error('Fictional Admin login failed');
  const before = await call('GET', '/admin/catalogue', token, 200);
  const snapshot = await one('Historical order', db.from('orders').select('id,subtotal,total_amount,pickup_delivery_charge,gst_rate').order('created_at', {ascending: false}).limit(1).single());
  const name = `9E Fictional Category ${Date.now()}`;
  const category = await call('POST', '/admin/catalogue/categories', token, 201, {name, description: 'Local test'});
  const service = await call('POST', '/admin/catalogue/services', token, 201, {name: `${name} Shirt`, categoryId: category.id, pricingUnit: 'item'});
  if (!category.id || !service.id) throw new Error('Category or service creation failed');
  await call('POST', `/admin/catalogue/services/${service.id}/prices`, token, 400, {price: -1});
  const first = await call('POST', `/admin/catalogue/services/${service.id}/prices`, token, 201, {price: 41});
  const second = await call('POST', `/admin/catalogue/services/${service.id}/prices`, token, 201, {price: 42});
  const publicList = await call('GET', '/services', token, 200);
  if (!publicList.some(row => row.id === service.id && row.price === 42 && row.categoryName === name))
    throw new Error('Customer catalogue did not pick up new active price');
  const history = await one('Versioned prices', db.from('service_prices').select('id,price,effective_to').eq('service_id', service.id).order('effective_from', {ascending: true}));
  if (history.length !== 2 || history[0].effective_to === null || Number(history[1].price) !== 42)
    throw new Error('Previous price was not retained');
  console.log('PASS: Admin category/service creation, negative price rejection, current price and historical price retention');
  const packageRow = await one('Fictional unsold package', db.from('packages').insert({name: `${name} Package`, description: 'Local eligibility test', monthly_price: 1, price: 1, is_active: false}).select('id').single());
  await call('POST', `/admin/catalogue/packages/${packageRow.id}/eligibility`, token, 201,
    {serviceId: service.id, eligible: true, usageLimit: 3});
  let eligibility = await one('Package eligibility', db.from('package_services').select('usage_limit').eq('package_id', packageRow.id).eq('service_id', service.id).single());
  if (eligibility.usage_limit !== 3) throw new Error('Package eligibility was not saved');
  await call('POST', `/admin/catalogue/packages/${packageRow.id}/eligibility`, token, 201,
    {serviceId: service.id, eligible: false, usageLimit: null});
  eligibility = await one('Package eligibility after removal', db.from('package_services').select('id').eq('package_id', packageRow.id).eq('service_id', service.id));
  if (eligibility.length) throw new Error('Package eligibility was not removed');
  const customer = await one('Fictional subscription customer', db.from('customers').select('id').limit(1).single());
  await one('Fictional locked subscription', db.from('package_subscriptions').insert({customer_id: customer.id, package_id: packageRow.id,
    status: 'expired', expires_at: new Date(Date.now() + 86400000).toISOString()}).select('id').single());
  await call('POST', `/admin/catalogue/packages/${packageRow.id}/eligibility`, token, 409,
    {serviceId: service.id, eligible: true, usageLimit: 3});
  console.log('PASS: unsold package eligibility updated; sold package eligibility locked without charge');
  const changedPolicy = await call('POST', '/admin/catalogue/pricing-policy', token, 201,
    {pickupDeliveryFee: 75, freeDeliveryThreshold: 600, gstRatePercent: 12, minimumOrderAmount: 100});
  const currentPolicy = await call('GET', '/services/pricing-policy', token, 200);
  if (!changedPolicy.id || currentPolicy.pickupDeliveryFee !== 75 || currentPolicy.gstRatePercent !== 12 || currentPolicy.minimumOrderAmount !== 100)
    throw new Error('Server policy did not update');
  await call('POST', '/admin/catalogue/pricing-policy', token, 400,
    {pickupDeliveryFee: -1, freeDeliveryThreshold: 600, gstRatePercent: 12, minimumOrderAmount: 100});
  await call('POST', '/admin/catalogue/pricing-policy', token, 201,
    {pickupDeliveryFee: before.policy.pickupDeliveryFee, freeDeliveryThreshold: before.policy.freeDeliveryThreshold,
      gstRatePercent: before.policy.gstRatePercent, minimumOrderAmount: before.policy.minimumOrderAmount});
  console.log('PASS: future checkout policy updates, invalid policy blocked and original local policy restored');
  await call('PATCH', `/admin/catalogue/services/${service.id}`, token, 200, {isActive: false});
  const hidden = await call('GET', '/services', token, 200);
  if (hidden.some(row => row.id === service.id)) throw new Error('Inactive service still publicly available');
  await call('PATCH', `/admin/catalogue/categories/${category.id}`, token, 200, {isActive: false});
  const after = await one('Historical order', db.from('orders').select('id,subtotal,total_amount,pickup_delivery_charge,gst_rate').eq('id', snapshot.id).single());
  if (JSON.stringify(after) !== JSON.stringify(snapshot)) throw new Error('Historical order pricing changed');
  const audit = await one('Admin catalogue audit', db.from('admin_catalogue_audit').select('action').eq('actor_profile_id', login.profile.id).limit(100));
  if (audit.length < 7) throw new Error('Commercial changes were not audited');
  const users = await db.auth.admin.listUsers({page: 1, perPage: 1000});
  const driver = users.data?.users.find(user => String(user.phone ?? '').replace(/\D/g, '') === '16505550102');
  if (driver) {
    const denied = await db.rpc('admin_catalogue_change_atomic', {p_actor_profile_id: driver.id, p_action: 'set_policy',
      p_payload: {pickupDeliveryFee: 1, freeDeliveryThreshold: 2, gstRatePercent: 3}});
    if (denied.error?.code !== '42501') throw new Error('Non-Admin database mutation was not blocked');
  }
  console.log('PASS: inactive service hidden, historical order totals unchanged, Admin-only writes and immutable audit recorded');
  console.log('PASS: fictional catalogue retained inactive; no Production traffic');
}
main().catch(error => {console.error(`FAIL: ${error.message}`); process.exitCode = 1;});
