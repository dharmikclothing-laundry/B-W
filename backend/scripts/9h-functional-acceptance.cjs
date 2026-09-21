/* Read-only fictional Development acceptance. Never contact Production. */
const fs = require('fs');
const path = require('path');
require('dotenv').config({path: path.join(__dirname, '..', '.env'), quiet: true});
const local = value => {try {return ['localhost', '127.0.0.1', '::1'].includes(new URL(value).hostname);} catch {return false;}};
if (!local(process.env.SUPABASE_URL) || process.env.NODE_ENV === 'production' || process.env.RAZORPAY_MODE !== 'mock' || process.env.GOOGLE_MAPS_MODE !== 'mock')
  throw new Error('9H requires local Supabase and mock providers');
const config = fs.readFileSync(path.join(__dirname, '..', 'supabase/config.toml'), 'utf8');
const otpFor = phone => config.match(new RegExp(`^${phone}\\s*=\\s*"(\\d+)"`, 'm'))?.[1];
const api = 'http://127.0.0.1:3001/v1';
async function call(route, token, expected) {
  const response = await fetch(`${api}${route}`, {headers: token ? {authorization: `Bearer ${token}`} : {}});
  if (response.status !== expected) {
    const failure = await response.json().catch(() => ({}));
    throw new Error(`${route}: expected ${expected}, got ${response.status}: ${failure.message || 'unknown error'}`);
  }
  return response.json().catch(() => ({}));
}
async function login(phone) {
  const otp = otpFor(phone.replace('+', ''));
  if (!otp) throw new Error('Fictional local OTP unavailable');
  const request = async (route, payload) => {
    const response = await fetch(`${api}${route}`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(payload)});
    if (response.status !== 201) throw new Error(`Local login failed: ${response.status}`);
    return response.json();
  };
  await request('/auth/phone/request-otp', {phone});
  return request('/auth/phone/verify-otp', {phone, token: otp});
}
async function main() {
  await call('/admin/facilities', null, 401);
  const customer = await login('+16505550101');
  const customerToken = customer.session?.access_token;
  if (!customerToken || customer.profile?.accountRole === 'admin') throw new Error('Fictional non-Admin account unavailable');
  await call('/admin/facilities', customerToken, 403);
  console.log('PASS: unauthenticated and customer cross-Facility access blocked');
  const admin = await login('+16505550106');
  const token = admin.session?.access_token;
  if (!token || admin.profile?.accountRole !== 'admin') throw new Error('Fictional Admin login failed');
  const overview = await call('/admin/facilities', token, 200);
  if (!Array.isArray(overview.facilities) || overview.monitoring?.contractualSla !== false)
    throw new Error('Facility oversight response invalid');
  for (const facility of overview.facilities) {
    const detail = await call(`/admin/facilities/${facility.id}`, token, 200);
    if (detail.summary?.id !== facility.id || !Array.isArray(detail.orders) ||
        detail.orders.some(order => order.facility_id !== facility.id)) throw new Error('Cross-Facility order leakage');
    for (const order of detail.orders.slice(0, 3)) {
      const audit = await call(`/admin/facilities/${facility.id}/orders/${order.id}`, token, 200);
      if (audit.order?.facility_id !== facility.id || JSON.stringify(audit).includes('secure_token'))
        throw new Error('Facility audit mismatch or QR secret exposed');
    }
  }
  console.log(`PASS: Admin read-only oversight across ${overview.facilities.length} local facilities; order attribution and QR secret isolation`);
  if (overview.facilities.length > 1) {
    const first = await call(`/admin/facilities/${overview.facilities[0].id}`, token, 200);
    const other = overview.facilities[1];
    if (first.orders.length) await call(`/admin/facilities/${other.id}/orders/${first.orders[0].id}`, token, 404);
  }
  console.log('PASS: Facility order drill-down rejects wrong-facility request; local/mock only');
}
main().catch(error => {console.error(`FAIL: ${error.message}`); process.exitCode = 1;});
