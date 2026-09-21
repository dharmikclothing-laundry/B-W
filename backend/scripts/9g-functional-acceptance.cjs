/* Fictional local-only 9G acceptance; no real payment, SMS, Maps or Production traffic. */
const fs = require('fs');
const path = require('path');
const {randomUUID} = require('crypto');
require('dotenv').config({path: path.join(__dirname, '..', '.env'), quiet: true});
const {createClient} = require('@supabase/supabase-js');
const local = value => {try {return ['localhost','127.0.0.1','::1'].includes(new URL(value).hostname);} catch {return false;}};
if (!local(process.env.SUPABASE_URL) || process.env.NODE_ENV === 'production' || process.env.RAZORPAY_MODE !== 'mock' || process.env.GOOGLE_MAPS_MODE !== 'mock')
  throw new Error('9G requires local Supabase and mock providers');
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
async function one(label, query) {const {data,error}=await query; if (error || !data) throw new Error(`${label}: ${error?.message || 'missing'}`); return data;}
async function main() {
  await call('GET', '/admin/growth', null, 401);
  const phone = '+16505550106';
  await call('POST', '/auth/phone/request-otp', null, 201, {phone});
  const login = await call('POST', '/auth/phone/verify-otp', null, 201, {phone, token: otp});
  const token = login.session?.access_token;
  if (!token || login.profile?.accountRole !== 'admin') throw new Error('Fictional Admin login failed');
  const before = await call('GET', '/admin/growth', token, 200);
  const nonAdmin = await one('Local customer actor', db.from('customers').select('profile_id').limit(1).single());
  const forbidden = await db.rpc('admin_growth_change_atomic', {p_actor: nonAdmin.profile_id,
    p_action: 'set_offer_active', p_payload: {id: randomUUID(), isActive: true}});
  if (forbidden.error?.code !== '42501') throw new Error('Non-Admin database growth mutation was not blocked');
  const settings = before.settings;
  const snapshot = await one('Historical order', db.from('orders').select('id,total_amount,discount_amount').order('created_at', {ascending: false}).limit(1).single());
  const offerCode = `LOCAL9G-${Date.now()}`;
  const offerInput = {couponCode: offerCode, name: '9G Fictional Limited Offer', discountType: 'fixed', discountValue: 10,
    minimumOrderAmount: 50, maximumDiscount: 20, startsAt: null, expiresAt: new Date(Date.now() + 86400000).toISOString(),
    usageLimit: 1, eligibilityNote: 'Local fictional customer only'};
  await call('POST', '/admin/growth/offers', token, 400, {...offerInput, discountValue: -1});
  const offer = await call('POST', '/admin/growth/offers', token, 201, offerInput);
  if (!offer.id || offer.is_active) throw new Error('New offer must be inactive until approved');
  await call('PATCH', `/admin/growth/offers/${offer.id}`, token, 200, {...offerInput, discountValue: 12});
  await call('PATCH', `/admin/growth/offers/${offer.id}/active`, token, 200, {isActive: true});
  const quote = await call('POST', '/growth/coupon', token, 201, {code: offerCode, orderAmount: 100});
  if (quote.discount !== 12) throw new Error('Customer quote ignored Admin discount');
  console.log('PASS: Admin offer validation, draft activation, edit, eligibility and customer quote');
  const source = await one('Local order for fictional checkout', db.from('orders')
    .select('customer_id,pickup_address_id,delivery_address_id,facility_id').not('pickup_address_id','is',null).limit(1).single());
  const service = await one('Active service', db.from('services').select('id').eq('is_active',true).limit(1).single());
  const orderPayload = () => ({facility_id: source.facility_id, pickup_address_id: source.pickup_address_id,
    delivery_address_id: source.delivery_address_id || source.pickup_address_id,
    pickup_scheduled_at: new Date(Date.now() + 86400000).toISOString(), pickup_slot_label: '9G local test',
    subtotal: 100,discount_amount: 12,coupon_offer_id: offer.id,coupon_discount_amount: 12,package_discount_amount: 0,
    loyalty_discount_amount: 0,pickup_delivery_charge: 50,taxable_amount: 138,gst_rate: 5,gst_amount: 6.9,
    total_amount: 144.9,payment_method: 'cash_on_delivery',terms_version: '9g-local',
    idempotency_key: randomUUID(),idempotency_request_hash: randomUUID()});
  const items = [{service_id: service.id,item_name: 'Fictional 9G garment',quantity: 1,weight_kg: null,
    unit_price: 100,line_total: 100,customer_notes: 'Local fixture'}];
  const created = await one('First atomic limited coupon checkout', db.rpc('create_customer_order_with_rewards_atomic', {
    p_customer_id: source.customer_id,p_order: orderPayload(),p_items: items,p_target_status: 'confirmed',p_points: 0}));
  const second = await db.rpc('create_customer_order_with_rewards_atomic', {p_customer_id: source.customer_id,
    p_order: orderPayload(),p_items: items,p_target_status: 'confirmed',p_points: 0});
  if (!second.error || !/usage limit/i.test(second.error.message)) throw new Error('Second limited coupon checkout was not blocked atomically');
  const redemption = await one('Offer redemption', db.from('offer_redemptions').select('id,discount_amount,offer_snapshot,reversed_at').eq('order_id',created).single());
  if (Number(redemption.discount_amount) !== 12 || redemption.offer_snapshot.discount_value != 12) throw new Error('Historical coupon snapshot missing');
  await call('PATCH', `/admin/growth/offers/${offer.id}`, token, 409, {...offerInput, discountValue: 20});
  await call('POST', '/growth/coupon', token, 400, {code: offerCode, orderAmount: 100});
  const cancelled = await db.rpc('cancel_order_by_admin_atomic', {p_order_id: created,p_admin_profile_id: login.profile.id,p_reason: '9G fictional test cancellation'});
  if (cancelled.error) throw new Error(`Fictional cancellation failed: ${cancelled.error.message}`);
  const reversed = await one('Reversed redemption', db.from('offer_redemptions').select('reversed_at').eq('order_id',created).single());
  if (!reversed.reversed_at) throw new Error('Cancelled coupon did not release the usage slot');
  const nextQuote = await call('POST', '/growth/coupon', token, 201, {code: offerCode, orderAmount: 100});
  if (nextQuote.discount !== 12) throw new Error('Cancelled coupon usage was not released');
  await call('PATCH', `/admin/growth/offers/${offer.id}/active`, token, 200, {isActive: false});
  console.log('PASS: atomic limited-use redemption, over-limit denial, immutable snapshot, locked terms and cancellation reversal');
  const packageInput = {name: `9G Fictional Package ${Date.now()}`, description: 'Local unsold template', price: 99, validityDays: 45};
  const pkg = await call('POST', '/admin/growth/packages', token, 201, packageInput);
  if (!pkg.id || pkg.is_active) throw new Error('New package must be inactive until approved');
  await call('PATCH', `/admin/growth/packages/${pkg.id}`, token, 200, {...packageInput, price: 100});
  await call('PATCH', `/admin/growth/packages/${pkg.id}/services/${service.id}`, token, 200, {eligible: true,usageLimit: 3});
  await call('PATCH', `/admin/growth/packages/${pkg.id}/active`, token, 200, {isActive: true});
  const customer = await one('Local fictional package customer', db.from('customers').select('id').eq('id',source.customer_id).single());
  await one('Fictional sold-contract lock', db.from('package_subscriptions').insert({customer_id: customer.id,
    package_id: pkg.id,status: 'expired',expires_at: new Date(Date.now() + 86400000).toISOString()}).select('id').single());
  await call('PATCH', `/admin/growth/packages/${pkg.id}`, token, 409, {...packageInput,price: 200});
  await call('PATCH', `/admin/growth/packages/${pkg.id}/services/${service.id}`, token, 409, {eligible: false,usageLimit: null});
  await call('PATCH', `/admin/growth/packages/${pkg.id}/active`, token, 200, {isActive: false});
  console.log('PASS: package price, validity and credits; sold contract immutable; activation independent');
  try {
    await call('PATCH', '/admin/growth/settings', token, 200, {referralEnabled: false, referralRewardPoints: 50,
      loyaltyEarnPointsPerRupee: 0.02, loyaltyPointsPerRupee: 100, loyaltyMinimumRedemptionRupees: 5});
    const rules = await call('GET', '/growth/rules', token, 200);
    if (rules.referral_enabled || Number(rules.loyalty_earn_points_per_rupee) !== 0.02 || Number(rules.loyalty_minimum_redemption_rupees) !== 5)
      throw new Error('Admin growth policy did not reach customer contract');
    console.log('PASS: Admin referral and loyalty rule changes reach server-authoritative customer contract');
  } finally {
    await call('PATCH', '/admin/growth/settings', token, 200, {referralEnabled: settings.referral_enabled,
      referralRewardPoints: settings.referral_reward_points,
      loyaltyEarnPointsPerRupee: Number(settings.loyalty_earn_points_per_rupee),
      loyaltyPointsPerRupee: settings.loyalty_points_per_rupee,
      loyaltyMinimumRedemptionRupees: Number(settings.loyalty_minimum_redemption_rupees)});
  }
  const after = await one('Historical order', db.from('orders').select('id,total_amount,discount_amount').eq('id',snapshot.id).single());
  if (JSON.stringify(after) !== JSON.stringify(snapshot)) throw new Error('Historical order prices changed');
  const audit = await one('Admin growth audit', db.from('admin_growth_audit').select('action').eq('actor_profile_id',login.profile.id));
  for (const action of ['create_offer','update_offer','set_offer_active','create_package','update_package','set_package_active','set_program_settings'])
    if (!audit.some(row => row.action === action)) throw new Error(`Missing ${action} audit`);
  console.log('PASS: historical pricing unchanged, immutable Admin audit, local/mock only; no Production traffic');
}
main().catch(error => {console.error(`FAIL: ${error.message}`); process.exitCode=1;});
