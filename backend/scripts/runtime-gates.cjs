// Local-only integration checks. Tokens and keys stay in memory.
const assert = require('node:assert/strict');
require('dotenv').config({ quiet: true });
const { createClient } = require('@supabase/supabase-js');
const base = 'http://127.0.0.1:3000/v1';
assert(new URL(process.env.SUPABASE_URL).hostname === '127.0.0.1', 'Local Supabase required');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
async function api(path, method = 'GET', body, token, expected = 200) {
 const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
 const data = await r.json();
 if(r.status !== expected) throw new Error(`${method} ${path}: HTTP ${r.status}; ${JSON.stringify(data.message || data.error || 'unexpected response')}`);
 return data;
}
async function login(phone) {
 await api('/auth/phone/request-otp', 'POST', { phone }, null, 201);
 const d = await api('/auth/phone/verify-otp', 'POST', { phone, token: '123456' }, null, 201);
 const me = await api('/auth/me', 'GET', null, d.session.access_token);
 assert.equal(me.profile.id, d.user.id);
 assert(me.roles.some(r => r.roles.code === 'customer'));
 return { id: d.user.id, token: d.session.access_token };
}
async function checked(q) { const r = await q; if(r.error) throw new Error(r.error.message); return r.data; }
async function main() {
 for(const path of ['/health','/health/live','/health/ready']) await api(path);
 console.log('PASS Gate 1: health, liveness, readiness');
 await api('/auth/me','GET',null,null,401);
 await api('/auth/me','GET',null,'invalid-token',401);
 await api('/auth/phone/verify-otp','POST',{phone:'+16505550101',token:'000000'},null,401);
 const a = await login('+16505550101');
 const b = await login('+16505550102');
 const again = await api('/auth/me', 'GET', null, a.token);
 assert.equal(again.profile.id, a.id);
 const customer = await api('/customers/me', 'GET', null, a.token);
 assert.equal(customer.profile_id,a.id);
 console.log('PASS Gate 2: OTP, JWT, guard rejection, customer/role provisioning, two-user session isolation');
 if(process.argv.includes('--auth-only')) return;
 const addr = await api('/customers/me/addresses','POST',{label:'Runtime integration fixture',addressLine1:'1 Test Street',city:'Hyderabad',state:'Telangana',postalCode:'500001',latitude:17.44,longitude:78.38},a.token,201);
 await api(`/customers/me/addresses/${addr.id}`,'PATCH',{label:'Unauthorized'},b.token,403);
 let services = await checked(db.from('services').select('id,name').eq('name','Runtime integration test laundry').limit(1));
 if(!services.length) services = await checked(db.from('services').insert({name:'Runtime integration test laundry',pricing_unit:'item',is_active:true}).select('id,name'));
 const prices = await checked(db.from('service_prices').select('price').eq('service_id',services[0].id).is('facility_id',null).limit(1));
 if(!prices.length) await checked(db.from('service_prices').insert({service_id:services[0].id,price:25}));
 const order = await api('/orders','POST',{pickupAddressId:addr.id,deliveryAddressId:addr.id,paymentMethod:'cash_on_delivery',items:[{serviceId:services[0].id,itemName:'Runtime test shirt',quantity:1}]},a.token,201);
 assert.equal(order.current_status,'confirmed');
 await api(`/orders/${order.id}`,'GET',null,b.token,403);
 await api(`/orders/${order.id}/assign-driver`,'POST',{assignmentType:'pickup'},a.token,403);
 const qr = await api(`/qr/orders/${order.id}`, 'GET', null, a.token);
 assert(qr.payload.startsWith('BW1:'));
 await api(`/qr/orders/${order.id}`, 'GET', null, b.token,403);
 console.log('PASS Gate 3: customer address ownership, COD order creation, pricing, QR, order ownership and assignment authorization');
 console.log('Fixture order:',order.id);
}
main().catch(e => {console.error('FAIL',e.message);process.exitCode=1});
