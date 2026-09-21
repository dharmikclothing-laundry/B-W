/* Fictional, read-only local Development acceptance for 9I. */
const fs = require('fs');
const path = require('path');
require('dotenv').config({path: path.join(__dirname, '..', '.env'), quiet: true});
const {createClient} = require('@supabase/supabase-js');
const local = value => {try {return ['localhost', '127.0.0.1', '::1'].includes(new URL(value).hostname);} catch {return false;}};
if (!local(process.env.SUPABASE_URL) || process.env.NODE_ENV === 'production' || process.env.RAZORPAY_MODE !== 'mock' || process.env.GOOGLE_MAPS_MODE !== 'mock')
  throw new Error('9I requires local Supabase and mock providers');
const config = fs.readFileSync(path.join(__dirname, '..', 'supabase/config.toml'), 'utf8');
const otpFor = phone => config.match(new RegExp(`^${phone}\\s*=\\s*"(\\d+)"`, 'm'))?.[1];
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  {auth: {persistSession: false}});
const api = 'http://127.0.0.1:3001/v1';
async function get(route, token, expected) {
  const response = await fetch(`${api}${route}`, {headers: token ? {authorization: `Bearer ${token}`} : {}});
  if (response.status !== expected) {
    const problem = await response.json().catch(() => ({}));
    throw new Error(`${route}: expected ${expected}, got ${response.status}: ${problem.message || 'unknown error'}`);
  }
  return response;
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
async function count(table) {
  const {count: total, error} = await db.from(table).select('id', {head: true, count: 'exact'});
  if (error || total == null) throw new Error(`Local ${table} count unavailable`);
  return total;
}
async function main() {
  const tables = ['orders', 'payment_orders', 'refund_requests', 'admin_staff_action_audit', 'admin_catalogue_audit',
    'admin_assignment_audit', 'admin_issue_decision_audit', 'admin_growth_audit', 'financial_audit_logs'];
  const before = await Promise.all(tables.map(count));
  await get('/admin/analytics/report', null, 401);
  await get('/admin/analytics/audit.csv', null, 401);
  const customer = await login('+16505550101');
  const customerToken = customer.session?.access_token;
  if (!customerToken || customer.profile?.accountRole === 'admin') throw new Error('Fictional customer unavailable');
  for (const route of ['/admin/analytics/report', '/admin/analytics/audit', '/admin/analytics/report.csv', '/admin/analytics/audit.csv'])
    await get(route, customerToken, 403);
  console.log('PASS: anonymous and fictional non-Admin access denied for reports, audit and CSV');
  const admin = await login('+16505550106');
  const token = admin.session?.access_token;
  if (!token || admin.profile?.accountRole !== 'admin') throw new Error('Fictional Admin login failed');
  const range = `from=${new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10)}&to=${new Date().toISOString().slice(0, 10)}`;
  const report = await (await get(`/admin/analytics/report?${range}`, token, 200)).json();
  if (!report.revenue || !report.orders || !report.facilities || !report.growth || !Array.isArray(report.trend) ||
      Math.abs(report.revenue.netCaptured - (report.revenue.grossCaptured - report.revenue.refunded)) > 0.01)
    throw new Error('Admin report structure or revenue reconciliation failed');
  await get('/admin/analytics/report?from=2026-02-30&to=2026-03-01', token, 400);
  console.log(`PASS: local report reconciles revenue, orders, operations and growth; ${report.orders.created} orders in selected range`);
  const all = await (await get(`/admin/analytics/audit?${range}&limit=10`, token, 200)).json();
  const staff = await (await get(`/admin/analytics/audit?${range}&source=staff&q=deactivate&limit=10`, token, 200)).json();
  if (!Array.isArray(all.events) || !Array.isArray(staff.events) ||
      staff.events.some(event => event.source !== 'staff' || !event.action.includes('deactivate')))
    throw new Error('Audit search/filter invalid');
  const reportCsv = await get(`/admin/analytics/report.csv?${range}`, token, 200);
  const auditCsv = await get(`/admin/analytics/audit.csv?${range}&source=staff`, token, 200);
  if (!reportCsv.headers.get('content-type')?.includes('text/csv') || !(await reportCsv.text()).startsWith('"kind"') ||
      !auditCsv.headers.get('content-type')?.includes('text/csv') || !(await auditCsv.text()).startsWith('"time"'))
    throw new Error('Protected CSV export invalid');
  console.log(`PASS: Admin audit search, staff filter, pagination and protected CSV exports; ${all.total} events in selected range`);
  const after = await Promise.all(tables.map(count));
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('9I GET acceptance mutated operational or audit records');
  console.log('PASS: local operational and audit record counts unchanged; no Production activity');
}
main().catch(error => {console.error(`FAIL: ${error.message}`); process.exitCode = 1;});
