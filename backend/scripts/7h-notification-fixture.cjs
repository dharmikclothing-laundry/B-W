/* Fictional Driver inbox record, delivered locally with no push provider. */
const fs = require('fs');
const path = require('path');
require('dotenv').config({path: path.join(__dirname, '..', '.env'), quiet: true});
const {createClient} = require('@supabase/supabase-js');
const local = value => {try {return ['localhost', '127.0.0.1', '::1'].includes(new URL(value).hostname);} catch {return false;}};
if (!local(process.env.SUPABASE_URL) || process.env.NODE_ENV === 'production' ||
    process.env.GOOGLE_MAPS_MODE !== 'mock' || process.env.RAZORPAY_MODE !== 'mock') {
  throw new Error('Driver notification fixture requires local Supabase and mock providers');
}
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  {auth: {persistSession: false}});
const statePath = '/private/tmp/bw-7h-notification-fixture.json';
const assignmentPath = '/private/tmp/bw-7d-device-fixture.json';
async function prepare() {
  if (fs.existsSync(statePath)) throw new Error('Driver notification fixture already exists');
  const {driverProfileId, assignmentId, orderId} = JSON.parse(fs.readFileSync(assignmentPath, 'utf8'));
  const {data, error} = await db.from('notifications').insert({profile_id: driverProfileId, order_id: orderId,
    channel: 'in_app', event_type: 'driver.assignment', notification_type: 'driver.assignment',
    title: 'Assigned pickup', message: 'A fictional Development pickup is ready to review.',
    body: 'A fictional Development pickup is ready to review.', data: {assignmentId}, status: 'delivered'})
    .select('id').single();
  if (error || !data?.id) throw new Error(`Local Driver notification unavailable (${error?.code || 'empty'})`);
  fs.writeFileSync(statePath, JSON.stringify({id: data.id}), {mode: 0o600});
  console.log('PASS: fictional Driver notification available only as a local inbox record; no push sent');
}
async function cleanup() {
  const {id} = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const result = await db.from('notifications').delete().eq('id', id);
  if (result.error) throw new Error(`Local notification cleanup failed (${result.error.code})`);
  fs.unlinkSync(statePath);
  console.log('PASS: fictional Driver notification removed from local Supabase');
}
(process.argv[2] === 'prepare' ? prepare() : process.argv[2] === 'cleanup' ? cleanup() :
  Promise.reject(new Error('Usage: 7h-notification-fixture.cjs prepare|cleanup')))
  .catch(error => {console.error(`FAIL: ${error.message}`); process.exitCode = 1;});
