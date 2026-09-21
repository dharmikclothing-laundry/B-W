/* Re-run the approved local Driver auth, race, GPS and handover journeys. */
const path = require('path');
const {spawnSync} = require('child_process');
require('dotenv').config({path: path.join(__dirname, '..', '.env'), quiet: true});
const local = value => {try {return ['localhost', '127.0.0.1', '::1'].includes(new URL(value).hostname);} catch {return false;}};
if (!local(process.env.SUPABASE_URL) || process.env.NODE_ENV === 'production' ||
    process.env.GOOGLE_MAPS_MODE !== 'mock' || process.env.RAZORPAY_MODE !== 'mock') {
  throw new Error('7H acceptance requires local Supabase and mock providers');
}
const journeys = [
  ['Driver provisioning, RBAC and deactivation', '7a-functional-acceptance.cjs'],
  ['assignment race and reassignment', '7c-functional-acceptance.cjs'],
  ['GPS authorization, stale tracking and stop behavior', '7d-functional-acceptance.cjs'],
  ['pickup, facility handoff, delivery OTP and proof', '7g-functional-acceptance.cjs'],
];
(async () => {
  for (const [index, [name, script]] of journeys.entries()) {
    // Local Supabase has a five-second OTP interval; the API also limits
    // aggregate OTP requests to five per minute for this loopback client.
    if (index) await new Promise(resolve => setTimeout(resolve, index === 3 ? 61000 : 6000));
    const result = spawnSync(process.execPath, [path.join(__dirname, script)], {stdio: 'inherit', env: process.env});
    if (result.status !== 0) {
      console.error(`FAIL: 7H ${name} acceptance`);
      process.exit(result.status || 1);
    }
    console.log(`PASS: 7H ${name} acceptance`);
  }
})().catch(error => {console.error(`FAIL: 7H acceptance: ${error.message}`); process.exitCode = 1;});
