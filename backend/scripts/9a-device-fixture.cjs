/* Temporary fictional Admin for local Android QA; never a public endpoint. */
const fs = require('fs');
const path = require('path');
require('dotenv').config({path: path.join(__dirname, '..', '.env'), quiet: true});
const {createClient} = require('@supabase/supabase-js');
const local = value => { try { return ['localhost', '127.0.0.1', '::1'].includes(new URL(value).hostname); } catch { return false; } };
if (!local(process.env.SUPABASE_URL) || process.env.NODE_ENV === 'production' ||
    process.env.RAZORPAY_MODE !== 'mock' || process.env.GOOGLE_MAPS_MODE !== 'mock') {
  throw new Error('9A fixture requires local Supabase and mock providers');
}
const statePath = path.join(process.env.TMPDIR || '/private/tmp', 'bw-9a-admin-device-fixture.json');
const phone = '+16505550106';
const db = createClient(process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  {auth: {persistSession: false}});

async function main() {
  const mode = process.argv[2];
  if (!['prepare', 'cleanup'].includes(mode)) throw new Error('Usage: 9a-device-fixture.cjs prepare|cleanup');
  if (mode === 'cleanup') {
    if (!fs.existsSync(statePath)) {console.log('PASS: no fictional Admin device fixture remains'); return;}
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const result = await db.auth.admin.deleteUser(state.id);
    if (result.error) throw new Error('Fictional Admin cleanup failed');
    fs.unlinkSync(statePath);
    console.log('PASS: fictional Admin device fixture removed');
    return;
  }
  if (fs.existsSync(statePath)) throw new Error('Previous Admin fixture needs cleanup');
  const users = await db.auth.admin.listUsers({page: 1, perPage: 1000});
  if (users.error || users.data.users.some(user => user.phone === phone)) throw new Error('Fictional Admin phone unavailable');
  const created = await db.auth.admin.createUser({phone, phone_confirm: true,
    user_metadata: {full_name: '9A Fictional Admin', bw_admin_fixture: true}});
  if (created.error || !created.data.user) throw new Error('Fictional Admin creation failed');
  const id = created.data.user.id;
  fs.writeFileSync(statePath, JSON.stringify({id}), {mode: 0o600});
  const role = await db.from('roles').select('id').eq('code', 'admin').single();
  if (role.error || !role.data) throw new Error('Admin role unavailable; cleanup required');
  const assigned = await db.from('profile_roles').insert({profile_id: id, role_id: role.data.id});
  if (assigned.error) throw new Error('Admin role assignment failed; cleanup required');
  const active = await db.from('profiles').update({is_active: true}).eq('id', id).select('id').single();
  if (active.error || !active.data) throw new Error('Admin profile activation failed; cleanup required');
  console.log('PASS: fictional privileged Admin prepared in local Supabase');
}
main().catch(error => {console.error(`FAIL: ${error.message}`); process.exitCode = 1;});
