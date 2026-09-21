/* Activate the existing fictional Facility Staff only for local device QA. */
const fs = require('fs');
const path = require('path');
require('dotenv').config({path: path.join(__dirname, '..', '.env'), quiet: true});
const {createClient} = require('@supabase/supabase-js');
const statePath = path.join(process.env.TMPDIR || '/private/tmp', 'bw-8g-facility-device-fixture.json');
const local = value => { try { return ['localhost', '127.0.0.1', '::1'].includes(new URL(value).hostname); } catch { return false; } };
if (!local(process.env.SUPABASE_URL) || process.env.NODE_ENV === 'production' ||
    process.env.RAZORPAY_MODE !== 'mock' || process.env.GOOGLE_MAPS_MODE !== 'mock') {
  throw new Error('8G device fixture requires local Supabase and mock providers');
}
const admin = createClient(process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  {auth: {persistSession: false}});
const phone = '16505550103';
async function checked(label, query) {
  const {data, error} = await query;
  if (error || !data) throw new Error(`${label} unavailable (${error?.code || 'empty'})`);
  return data;
}
async function main() {
  const mode = process.argv[2];
  if (!['prepare', 'cleanup'].includes(mode)) throw new Error('Usage: 8g-device-fixture.cjs prepare|cleanup');
  if (mode === 'cleanup' && !fs.existsSync(statePath)) {
    console.log('PASS: no 8G Facility device fixture to restore');
    return;
  }
  if (mode === 'prepare' && fs.existsSync(statePath)) throw new Error('Previous 8G fixture needs cleanup first');
  const users = await admin.auth.admin.listUsers({page: 1, perPage: 1000});
  if (users.error) throw new Error('Local fictional users unavailable');
  const user = users.data.users.find(item => String(item.phone || '').replace(/\D/g, '') === phone);
  if (!user?.user_metadata?.bw_staff_provisioning) throw new Error('Admin-provisioned fictional Facility Staff absent');
  const profile = await checked('Facility profile', admin.from('profiles').select('is_active').eq('id', user.id).single());
  const employee = await checked('Facility employee', admin.from('facility_employees')
    .select('is_active,employee_role,facility_id').eq('profile_id', user.id).single());
  if (employee.employee_role !== 'facility_employee' || !employee.facility_id) throw new Error('Fictional Staff role/facility mismatch');
  if (mode === 'prepare') {
    fs.writeFileSync(statePath, JSON.stringify({id: user.id, profileActive: profile.is_active,
      employeeActive: employee.is_active}), {mode: 0o600});
    await checked('Facility profile activation', admin.from('profiles').update({is_active: true}).eq('id', user.id).select('id').single());
    await checked('Facility employee activation', admin.from('facility_employees').update({is_active: true}).eq('profile_id', user.id).select('id').single());
    console.log('PASS: fictional local Facility Staff prepared for device QA');
  } else {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (state.id !== user.id) throw new Error('Fixture identity changed; refusing cleanup');
    await checked('Facility employee restore', admin.from('facility_employees').update({is_active: state.employeeActive}).eq('profile_id', user.id).select('id').single());
    await checked('Facility profile restore', admin.from('profiles').update({is_active: state.profileActive}).eq('id', user.id).select('id').single());
    fs.unlinkSync(statePath);
    console.log('PASS: fictional Facility Staff original activation restored');
  }
}
main().catch(error => {console.error(`FAIL: ${error.message}`); process.exitCode = 1;});
