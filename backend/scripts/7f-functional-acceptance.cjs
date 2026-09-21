/* Fictional local-only 7F facility handoff acceptance. */
const fs = require('fs');
const path = require('path');
require('dotenv').config({path: path.join(__dirname, '..', '.env'), quiet: true});
const {createClient} = require('@supabase/supabase-js');
const local = value => {try {return ['localhost', '127.0.0.1', '::1'].includes(new URL(value).hostname);} catch {return false;}};
if (!local(process.env.SUPABASE_URL) || process.env.NODE_ENV === 'production' ||
    process.env.GOOGLE_MAPS_MODE !== 'mock' || process.env.RAZORPAY_MODE !== 'mock') {
  throw new Error('7F acceptance requires local Supabase and mock providers');
}
const config = fs.readFileSync(path.join(__dirname, '..', 'supabase/config.toml'), 'utf8');
const otp = phone => config.match(new RegExp(`^${phone.replace('+', '')}\\s*=\\s*"(\\d+)"`, 'm'))?.[1];
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY, {auth: {persistSession: false}});
const publicAuth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY, {auth: {persistSession: false}});
const api = 'http://127.0.0.1:3001/v1';
const samePhone = (left, right) => String(left || '').replace(/\D/g, '') === right.replace(/\D/g, '');
async function one(label, query) {const result = await query; if (result.error || !result.data) throw new Error(`${label} unavailable (${result.error?.code || 'empty'})`); return result.data;}
async function call(method, route, body, token, expected) {
  const response = await fetch(`${api}${route}`, {method, headers: {...(body ? {'content-type': 'application/json'} : {}), ...(token ? {authorization: `Bearer ${token}`} : {})}, ...(body ? {body: JSON.stringify(body)} : {})});
  if (response.status !== expected) {
    const failure = await response.json().catch(() => ({}));
    throw new Error(`${route}: expected ${expected}, got ${response.status} (${String(failure.message || 'no detail')})`);
  }
  return response.json().catch(() => ({}));
}
async function login(phone) {
  const code = otp(phone);
  if (!code) throw new Error('Fictional local OTP fixture missing');
  await call('POST', '/auth/phone/request-otp', {phone}, undefined, 201);
  const result = await call('POST', '/auth/phone/verify-otp', {phone, token: code}, undefined, 201);
  if (!result.session?.access_token) throw new Error('Fictional local login failed');
  return result.session.access_token;
}

async function main() {
  const adminEmail = `bw-7f-admin-${Date.now()}@example.test`;
  const created = await admin.auth.admin.createUser({email: adminEmail, email_confirm: true, user_metadata: {full_name: '7E Local Admin'}});
  if (created.error || !created.data.user) throw new Error('Local Admin fixture unavailable');
  const adminId = created.data.user.id;
  let orderId, driverProfileId, driverBefore, driverRow, driverLiveBefore, driverLocationStaged = false;
  let wrongProfileId, wrongBefore, wrongDriverRow, adminToken;
  let facilityProfileId, facilityBefore, facilityEmployeeBefore, localFacilityId, deliveryAddressId;
  let receiptQrId;
  let managerProfileId, managerBefore, managerEmployeeBefore;
  try {
    const adminRole = await one('Admin role', admin.from('roles').select('id').eq('code', 'admin').single());
    await one('Admin permission', admin.from('profile_roles').insert({profile_id: adminId, role_id: adminRole.id}).select('profile_id').single());
    const link = await admin.auth.admin.generateLink({type: 'magiclink', email: adminEmail});
    const session = await publicAuth.auth.verifyOtp({token_hash: link.data?.properties?.hashed_token, type: 'magiclink'});
    adminToken = session.data?.session?.access_token;
    if (!adminToken) throw new Error('Local Admin login failed');
    const users = await admin.auth.admin.listUsers({page: 1, perPage: 1000});
    if (users.error) throw new Error('Fictional users unavailable');
    const driver = users.data.users.find(user => samePhone(user.phone, '+16505550102'));
    const wrongDriver = users.data.users.find(user => samePhone(user.phone, '+16505550105'));
    const customer = users.data.users.find(user => samePhone(user.phone, '+16505550101'));
    const facilityUser = users.data.users.find(user => samePhone(user.phone, '+16505550103'));
    if (!driver?.user_metadata?.bw_staff_provisioning || !wrongDriver?.user_metadata?.bw_staff_provisioning || !customer) throw new Error('Admin-provisioned fictional users missing');
    if (!facilityUser?.user_metadata?.bw_staff_provisioning) throw new Error('Admin-provisioned fictional Facility employee missing');
    facilityProfileId = facilityUser.id;
    facilityBefore = await one('Facility profile', admin.from('profiles').select('is_active').eq('id', facilityProfileId).single());
    facilityEmployeeBefore = await one('Facility employee', admin.from('facility_employees').select('facility_id,is_active').eq('profile_id', facilityProfileId).single());
    driverProfileId = driver.id; wrongProfileId = wrongDriver.id;
    driverBefore = await one('Driver profile', admin.from('profiles').select('is_active').eq('id', driver.id).single());
    wrongBefore = await one('Other Driver profile', admin.from('profiles').select('is_active').eq('id', wrongDriver.id).single());
    await call('PATCH', `/admin/staff/${driver.id}/activate`, undefined, adminToken, 200);
    await call('PATCH', `/admin/staff/${wrongDriver.id}/activate`, undefined, adminToken, 200);
    await call('PATCH', `/admin/staff/${facilityProfileId}/activate`, undefined, adminToken, 200);
    driverRow = await one('Driver row', admin.from('drivers').select('id,is_available').eq('profile_id', driver.id).single());
    wrongDriverRow = await one('Other Driver row', admin.from('drivers').select('id,is_available').eq('profile_id', wrongDriver.id).single());
    const available = await admin.from('drivers').update({is_available: true}).eq('id', driverRow.id);
    if (available.error) throw new Error(`Driver availability failed (${available.error.code})`);
    const customerRow = await one('Customer', admin.from('customers').select('id').eq('profile_id', customer.id).single());
    const source = await one('Source order', admin.from('orders').select('facility_id,pickup_address_id,delivery_address_id').eq('current_status', 'confirmed').not('pickup_address_id', 'is', null).limit(1).single());
    if (process.env.BW_8F_ACCEPTANCE === '1') {
      const address = await one('Fictional delivery address', admin.from('customer_addresses').insert({
        customer_id: customerRow.id, label: '8F fictional delivery', address_line1: '1 Fictional Delivery Road',
        city: 'Local Test City', latitude: 17.4, longitude: 78.4,
        location: 'SRID=4326;POINT(78.4 17.4)',
      }).select('id').single());
      deliveryAddressId = address.id;
    }
    const destination = await one('7F local facility', admin.from('facilities').insert({name: `7F Fictional Facility ${Date.now()}`, address: '1 Fictional Road', latitude: 17.385, longitude: 78.4867, is_active: true}).select('id').single());
    localFacilityId = destination.id;
    source.facility_id = destination.id;
    const order = await one('Fictional order', admin.from('orders').insert({order_number: `BW-7F-${Date.now()}`, customer_id: customerRow.id, facility_id: source.facility_id, pickup_address_id: source.pickup_address_id, delivery_address_id: deliveryAddressId ?? source.delivery_address_id}).select('id').single());
    orderId = order.id;
    await one('Fictional QR', admin.from('order_qr_codes').insert({order_id: orderId}).select('id').single());
    await one('Fictional garment', admin.from('order_items').insert({order_id: orderId, item_name: 'Fictional shirts', quantity: 2, weight_kg: 1.5, unit_price: 0, line_total: 0}).select('id').single());
    const confirmed = await admin.rpc('change_order_status', {p_order_id: orderId, p_new_status: 'confirmed', p_reason: '7E local fixture'});
    if (confirmed.error) throw new Error(`Approved confirmation failed (${confirmed.error.code})`);
    const assigned = await one('Pickup assignment', admin.rpc('create_driver_assignment_atomic', {p_order_id: orderId, p_driver_id: driverRow.id, p_assignment_type: 'pickup', p_assignment_score: 0}));
    const assignmentId = assigned.assignment.id;
    const driverToken = await login('+16505550102');
    const customerToken = await login('+16505550101');
    const wrongEmail = wrongDriver.email || `bw-7e-other-${Date.now()}@example.test`;
    if (!wrongDriver.email) {
      const updated = await admin.auth.admin.updateUserById(wrongDriver.id, {email: wrongEmail, email_confirm: true});
      if (updated.error) throw new Error('Other Driver local email setup failed');
    }
    const wrongLink = await admin.auth.admin.generateLink({type: 'magiclink', email: wrongEmail});
    const wrongSession = await publicAuth.auth.verifyOtp({token_hash: wrongLink.data?.properties?.hashed_token, type: 'magiclink'});
    const wrongToken = wrongSession.data?.session?.access_token;
    if (!wrongToken) throw new Error('Other Driver login failed');
    const facilityEmail = facilityUser.email || `bw-7f-facility-${Date.now()}@example.test`;
    if (!facilityUser.email) {
      const updated = await admin.auth.admin.updateUserById(facilityProfileId, {email: facilityEmail, email_confirm: true});
      if (updated.error) throw new Error('Facility local email setup failed');
    }
    const facilityLink = await admin.auth.admin.generateLink({type: 'magiclink', email: facilityEmail});
    const facilitySession = await publicAuth.auth.verifyOtp({token_hash: facilityLink.data?.properties?.hashed_token, type: 'magiclink'});
    const facilityToken = facilitySession.data?.session?.access_token;
    if (!facilityToken) throw new Error('Facility employee login failed');
    const wrongFacility = facilityEmployeeBefore.facility_id !== source.facility_id ? facilityEmployeeBefore.facility_id : null;
    if (wrongFacility) {
      await one('Wrong Facility fixture', admin.from('facility_employees').update({facility_id: wrongFacility}).eq('profile_id', facilityProfileId).select('id').single());
    }
    await call('POST', `/driver-assignments/${assignmentId}/accept`, undefined, driverToken, 201);
    await call('POST', `/driver-assignments/${assignmentId}/navigation`, undefined, driverToken, 201);
    await call('POST', `/drivers/me/location`, {assignmentId, latitude: 17.4, longitude: 78.4, accuracyM: 8}, driverToken, 201);
    await call('POST', `/driver-assignments/${assignmentId}/arrive`, undefined, driverToken, 201);
    const job = await call('GET', `/drivers/me/assignments/${assignmentId}`, undefined, driverToken, 200);
    if (job.orderStatus !== 'pickup_otp_pending' || job.assignmentStatus !== 'arrived' || job.items?.[0]?.item_name !== 'Fictional shirts') throw new Error('Handover job or existing item details unavailable');
    console.log('PASS: Driver reaches pickup handover and sees existing garment details');
    await call('GET', `/drivers/me/assignments/${assignmentId}`, undefined, wrongToken, 404);
    const issued = await call('POST', `/orders/${orderId}/otp`, {otpType: 'pickup'}, customerToken, 201);
    await call('POST', `/driver-assignments/${assignmentId}/facility-transit`, undefined, driverToken, 409);
    await call('POST', `/orders/${orderId}/otp/verify`, {otpType: 'pickup', otp: issued.otp}, wrongToken, 403);
    await call('POST', `/orders/${orderId}/otp/verify`, {otpType: 'pickup', otp: '000000'}, driverToken, 400);
    const expired = await admin.from('order_otps').update({expires_at: new Date(Date.now() - 60_000).toISOString()}).eq('id', issued.otpId);
    if (expired.error) throw new Error(`Local expiry setup failed (${expired.error.code})`);
    await call('POST', `/orders/${orderId}/otp/verify`, {otpType: 'pickup', otp: issued.otp}, driverToken, 400);
    console.log('PASS: wrong Driver, invalid OTP, and expired OTP rejected');
    const refreshed = await call('POST', `/orders/${orderId}/otp`, {otpType: 'pickup'}, customerToken, 201);
    const verified = await call('POST', `/orders/${orderId}/otp/verify`, {otpType: 'pickup', otp: refreshed.otp}, driverToken, 201);
    if (!verified.verified || verified.orderStatus !== 'picked_up') throw new Error('Atomic pickup completion failed');
    await call('POST', `/orders/${orderId}/otp/verify`, {otpType: 'pickup', otp: refreshed.otp}, driverToken, 409);
    const customerOrder = await call('GET', `/orders/${orderId}`, undefined, customerToken, 200);
    const nextJob = await call('GET', `/drivers/me/assignments/${assignmentId}`, undefined, driverToken, 200);
    const dashboard = await call('GET', '/drivers/me/dashboard', undefined, driverToken, 200);
    if (customerOrder.current_status !== 'picked_up' || nextJob.orderStatus !== 'picked_up' ||
        !dashboard.pickups?.some(job => job.id === assignmentId)) throw new Error('Customer or Driver pickup state did not refresh');
    console.log('PASS: atomic OTP completes pickup once; customer and Driver see picked-up state');
    await call('POST', `/driver-assignments/${assignmentId}/facility-transit`, undefined, wrongToken, 404);
    const started = await call('POST', `/driver-assignments/${assignmentId}/facility-transit`, undefined, driverToken, 201);
    if (started.orderStatus !== 'in_transit_to_facility') throw new Error('Facility transit did not use approved transition');
    await call('POST', `/driver-assignments/${assignmentId}/facility-transit`, undefined, driverToken, 409);
    const code = await call('GET', `/drivers/me/assignments/${assignmentId}/handoff-qr`, undefined, driverToken, 200);
    if (code.orderId !== orderId || !code.payload?.startsWith('BW1:')) throw new Error('Scoped handoff code unavailable');
    if (process.env.BW_8B_ACCEPTANCE === '1') {
      const repeated = await call('GET', `/drivers/me/assignments/${assignmentId}/handoff-qr`, undefined, driverToken, 200);
      const customerQr = await call('GET', `/qr/orders/${orderId}`, undefined, customerToken, 200);
      const {data: qrRows, error: qrError} = await admin.from('order_qr_codes').select('id').eq('order_id', orderId);
      if (repeated.payload !== code.payload || customerQr.payload !== code.payload || qrError || qrRows?.length !== 1) {
        throw new Error('Eligible order does not have exactly one stable QR value');
      }
      receiptQrId = qrRows[0].id;
      await call('POST', '/qr/scan', {token: code.payload, action: 'lookup'}, customerToken, 403);
      await call('POST', '/qr/scan', {token: code.payload, action: 'facility_received'}, driverToken, 400);
      console.log('PASS: one stable QR per eligible order; customer reads own, cannot scan; legacy scan cannot spoof receipt');
    }
    await call('GET', `/drivers/me/assignments/${assignmentId}/handoff-qr`, undefined, wrongToken, 404);
    await call('GET', `/qr/orders/${orderId}`, undefined, wrongToken, 403);
    console.log('PASS: only owning Driver can start facility transit and display its handoff code');
    if (!wrongFacility) throw new Error('Wrong-facility fixture is unavailable');
    await call('POST', '/facility/receive/qr', {token: code.payload}, facilityToken, 403);
    if (process.env.BW_8B_ACCEPTANCE === '1') {
      await call('POST', '/facility/receive/preview', {token: code.payload}, facilityToken, 403);
      await call('GET', `/qr/orders/${orderId}`, undefined, facilityToken, 403);
      await call('POST', '/qr/scan', {token: code.payload, action: 'lookup'}, facilityToken, 403);
    }
    console.log('PASS: wrong facility and legacy cross-Driver QR lookup are rejected');
    await one('Correct Facility fixture', admin.from('facility_employees').update({facility_id: source.facility_id}).eq('profile_id', facilityProfileId).select('id').single());
    await call('POST', '/facility/receive/qr', {token: 'BW1:00000000-0000-4000-8000-000000000000'}, facilityToken, 404);
    if (process.env.BW_8B_ACCEPTANCE === '1') {
      const preview = await call('POST', '/facility/receive/preview', {token: code.payload}, facilityToken, 201);
      const acceptedOrder = await one('8B preview source order', admin.from('orders').select('order_number').eq('id', orderId).single());
      if (preview.orderId !== orderId || preview.orderNumber !== acceptedOrder.order_number ||
          preview.facility.id !== source.facility_id || preview.items?.[0]?.quantity !== 2) {
        throw new Error('Facility intake preview did not resolve order, location and garment details');
      }
      await call('GET', `/qr/orders/${orderId}`, undefined, facilityToken, 200);
      await call('POST', '/qr/scan', {token: code.payload, action: 'lookup'}, facilityToken, 201);
      console.log('PASS: only assigned Facility resolves preview and lookup; physical items visible before confirmation');
    }
    const receipt = await call('POST', '/facility/receive/qr', {token: code.payload}, facilityToken, 201);
    if (!receipt.received || receipt.orderStatus !== 'received_at_facility' || receipt.pickupAssignmentStatus !== 'completed') throw new Error('Atomic facility receipt failed');
    await call('POST', '/facility/receive/qr', {token: code.payload}, facilityToken, 409);
    if (process.env.BW_8B_ACCEPTANCE === '1') {
      await call('POST', '/facility/receive/preview', {token: code.payload}, facilityToken, 409);
      const {data: receiptLogs, error: logsError} = await admin.from('qr_scan_logs')
        .select('scan_action').eq('qr_code_id', receiptQrId).eq('scan_action', 'facility_received');
      if (logsError || receiptLogs?.length !== 1) throw new Error('Atomic receiving audit is missing or duplicated');
      console.log('PASS: duplicate preview/receipt blocked and exactly one authoritative receiving audit retained');
    }
    await call('GET', `/drivers/me/assignments/${assignmentId}/handoff-qr`, undefined, driverToken, 409);
    const finalOrder = await call('GET', `/orders/${orderId}`, undefined, customerToken, 200);
    const finalJob = await call('GET', `/drivers/me/assignments/${assignmentId}`, undefined, driverToken, 200);
    const queue = await one('Facility processing queue', admin.from('facility_order_operations').select('order_id,facility_id,current_status').eq('order_id', orderId).single());
    if (finalOrder.current_status !== 'received_at_facility' || finalJob.assignmentStatus !== 'completed' ||
        queue.facility_id !== source.facility_id || queue.current_status !== 'received') throw new Error('Customer, Driver or Facility queue failed to reflect handoff');
    console.log('PASS: Facility confirms once; customer, Driver and Facility processing queue reflect atomic receipt');
    if (['1'].includes(process.env.BW_8C_ACCEPTANCE) ||
        ['1'].includes(process.env.BW_8D_ACCEPTANCE) || ['1'].includes(process.env.BW_8E_ACCEPTANCE) ||
        ['1'].includes(process.env.BW_8F_ACCEPTANCE)) {
      await one('8C intake policy marker', admin.from('facility_intake_policy_orders')
        .select('order_id').eq('order_id', orderId).single());
      const intake = await call('GET', `/facility/orders/${orderId}/intake`, undefined, facilityToken, 200);
      const listed = intake.items?.[0];
      if (intake.items?.length !== 1 || listed.quantity !== 2 || Number(listed.weight_kg) !== 1.5 || intake.inspections.length) {
        throw new Error('Customer item snapshot unavailable before physical verification');
      }
      await call('POST', `/facility/orders/${orderId}/intake-verify`, {items: [
        {orderItemId: listed.id, countedQuantity: 1, weightKg: 2, damaged: true},
      ]}, facilityToken, 409);
      const verified = await call('POST', `/facility/orders/${orderId}/intake-verify`, {items: [
        {orderItemId: listed.id, countedQuantity: 1, weightKg: 2, damaged: true, notes: 'Fictional intake mismatch'},
      ], notes: '8C local garment intake'}, facilityToken, 201);
      if (!verified.verified || verified.discrepancyCount !== 3) throw new Error('Item verification/discrepancy result incorrect');
      const post = await call('GET', `/facility/orders/${orderId}/intake`, undefined, facilityToken, 200);
      const unchanged = await one('Customer order item', admin.from('order_items').select('quantity,weight_kg').eq('id', listed.id).single());
      if (post.orderStatus !== 'verification' || post.inspections.length !== 1 || post.discrepancies.length !== 3 ||
          unchanged.quantity !== 2 || Number(unchanged.weight_kg) !== 1.5) {
        throw new Error('Measured records or original checkout values incorrect');
      }
      await call('POST', `/facility/orders/${orderId}/intake-verify`, {items: [
        {orderItemId: listed.id, countedQuantity: 1, weightKg: 2, damaged: true, notes: 'duplicate'},
      ]}, facilityToken, 409);
      await call('POST', `/facility/orders/${orderId}/processing`, {processType: 'washing'}, facilityToken, 409);
      const stillVerification = await one('Order after blocked processing', admin.from('orders').select('current_status').eq('id', orderId).single());
      if (stillVerification.current_status !== 'verification') throw new Error('Processing started with open intake discrepancies');
      console.log('PASS: atomic per-item count/weight/damage verification; checkout values unchanged; duplicate and processing blocked');

      const managerUser = users.data.users.find(user => samePhone(user.phone, '+16505550104'));
      if (!managerUser?.user_metadata?.bw_staff_provisioning) throw new Error('Fictional Admin-provisioned Facility Manager missing');
      managerProfileId = managerUser.id;
      managerBefore = await one('Manager profile', admin.from('profiles').select('is_active').eq('id', managerProfileId).single());
      managerEmployeeBefore = await one('Manager employee', admin.from('facility_employees')
        .select('facility_id,is_active,employee_role').eq('profile_id', managerProfileId).single());
      if (managerEmployeeBefore.employee_role !== 'manager') throw new Error('Manager fixture has wrong role');
      await call('PATCH', `/admin/staff/${managerProfileId}/activate`, undefined, adminToken, 200);
      await one('Manager assigned local Facility', admin.from('facility_employees')
        .update({facility_id: source.facility_id}).eq('profile_id', managerProfileId).select('id').single());
      const managerToken = await login('+16505550104');
      await call('PATCH', `/facility/orders/${orderId}/intake-discrepancies/${post.discrepancies[0].id}/resolve`,
        {notes: 'Unauthorized'}, facilityToken, 403);
      await call('PATCH', `/facility/orders/${orderId}/intake-discrepancies/${post.discrepancies[0].id}/resolve`,
        {notes: ''}, managerToken, 400);
      for (const discrepancy of post.discrepancies) {
        await call('PATCH', `/facility/orders/${orderId}/intake-discrepancies/${discrepancy.id}/resolve`,
          {notes: 'Fictional manager reconciliation'}, managerToken, 200);
      }
      const resolved = await call('GET', `/facility/orders/${orderId}/intake`, undefined, facilityToken, 200);
      if (resolved.discrepancies.some(item => item.status !== 'resolved' || !item.resolution_notes || !item.resolved_at)) {
        throw new Error('Discrepancy resolution audit incomplete');
      }
      if (process.env.BW_8D_ACCEPTANCE === '1' || process.env.BW_8E_ACCEPTANCE === '1' ||
          process.env.BW_8F_ACCEPTANCE === '1') {
        await one('Temporary wrong Facility assignment', admin.from('facility_employees')
          .update({facility_id: facilityEmployeeBefore.facility_id}).eq('profile_id', facilityProfileId).select('id').single());
        await call('GET', `/facility/orders/${orderId}/processing`, undefined, facilityToken, 403);
        await call('POST', `/facility/orders/${orderId}/processing`, {processType: 'washing'}, facilityToken, 403);
        await one('Restore correct Facility assignment', admin.from('facility_employees')
          .update({facility_id: source.facility_id}).eq('profile_id', facilityProfileId).select('id').single());
        await call('POST', `/facility/orders/${orderId}/processing`, {processType: 'drying'}, facilityToken, 409);
        const names = ['washing', 'drying', 'ironing', 'folding', 'packaging'];
        for (const [index, name] of names.entries()) {
          const before = await call('GET', `/facility/orders/${orderId}/processing`, undefined, facilityToken, 200);
          if (before.nextStage !== name || before.openDiscrepancies) throw new Error(`Unexpected next stage before ${name}`);
          const started = await call('POST', `/facility/orders/${orderId}/processing`, {processType: name}, facilityToken, 201);
          await call('POST', `/facility/orders/${orderId}/processing`, {processType: name}, facilityToken, 409);
          if (index < names.length - 1) {
            await call('POST', `/facility/orders/${orderId}/processing`, {processType: names[index + 1]}, facilityToken, 409);
          }
          await call('POST', `/facility/operations/${started.operationId}/complete`, undefined, facilityToken, 201);
          await call('POST', `/facility/operations/${started.operationId}/complete`, undefined, facilityToken, 409);
          const during = await call('GET', `/facility/orders/${orderId}/processing`, undefined, facilityToken, 200);
          const record = during.stages[index];
          if (record?.operation_type !== name || !record.started_at || !record.completed_at ||
              record.started_by !== facilityProfileId || record.completed_by !== facilityProfileId) {
            throw new Error(`Missing ${name} audit timestamps or actors`);
          }
        }
        const after = await call('GET', `/facility/orders/${orderId}/processing`, undefined, facilityToken, 200);
        const customerView = await call('GET', `/orders/${orderId}`, undefined, customerToken, 200);
        if (after.stages.length !== 5 || after.nextStage || after.activeOperationId || after.orderStatus !== 'processing' ||
            customerView.current_status !== 'processing') throw new Error('Final pack-prep state or customer lifecycle incorrect');
        await call('POST', `/facility/orders/${orderId}/processing`, {processType: 'washing'}, facilityToken, 409);
        console.log('PASS: scoped, sequential, atomic Wash through Pack-prep with immutable stage audit; QC untouched');
        if (process.env.BW_8E_ACCEPTANCE === '1' || process.env.BW_8F_ACCEPTANCE === '1') {
          const qcRoute = `/facility/orders/${orderId}/quality-check`;
          await call('POST', qcRoute, {approved: true}, facilityToken, 403);
          await call('POST', qcRoute, {approved: false, defectCode: 'stain', notes: 'Too short',
            affectedItemIds: ['00000000-0000-4000-8000-000000000000']}, managerToken, 409);
          await call('POST', qcRoute, {approved: false, notes: 'Stain remains'}, managerToken, 400);
          const firstFail = await call('POST', qcRoute, {approved: false, defectCode: 'stain',
            notes: 'Stain remains after washing', affectedItemIds: [listed.id]}, managerToken, 201);
          if (firstFail.orderStatus !== 'rework_required' || firstFail.cycleNumber !== 0 || !firstFail.rewashRequired) {
            throw new Error('First failed QC did not require rewash');
          }
          await call('POST', qcRoute, {approved: true}, managerToken, 409);
          const cycleNames = ['washing', 'drying', 'ironing', 'folding', 'packaging'];
          for (const expectedCycle of [1, 2]) {
            for (const stage of cycleNames) {
              const start = await call('POST', `/facility/orders/${orderId}/processing`, {processType: stage}, facilityToken, 201);
              await call('POST', `/facility/operations/${start.operationId}/complete`, undefined, facilityToken, 201);
            }
            const history = await call('GET', `/facility/orders/${orderId}/processing`, undefined, managerToken, 200);
            if (history.stages.length !== (expectedCycle + 1) * 5 ||
                history.stages.slice(-5).some(stage => stage.rewash_cycle !== expectedCycle || !stage.completed_at)) {
              throw new Error(`Cycle ${expectedCycle} did not preserve processing history`);
            }
            if (expectedCycle === 1) {
              const secondFail = await call('POST', qcRoute, {approved: false, defectCode: 'finish',
                notes: 'Finish still needs work', affectedItemIds: []}, managerToken, 201);
              if (secondFail.cycleNumber !== 1 || secondFail.orderStatus !== 'rework_required') {
                throw new Error('Second QC failure did not create rewash cycle');
              }
            }
          }
          await call('POST', qcRoute, {approved: false, defectCode: 'other',
            notes: 'Third failed cycle must be blocked'}, managerToken, 409);
          await call('POST', qcRoute, {approved: true}, managerToken, 409);
          const packingRoute = `/facility/orders/${orderId}/packing`;
          if (process.env.BW_8F_ACCEPTANCE === '1') {
            const preview = await call('GET', packingRoute, undefined, facilityToken, 200);
            if (!preview.canPack || preview.cycleNumber !== 2 || preview.items?.[0]?.verifiedQuantity !== 1 ||
                preview.history.length) throw new Error('Current-cycle verified packing preview incorrect');
            await one('Temporary wrong Facility packing assignment', admin.from('facility_employees')
              .update({facility_id: facilityEmployeeBefore.facility_id}).eq('profile_id', facilityProfileId).select('id').single());
            await call('GET', packingRoute, undefined, facilityToken, 403);
            await call('POST', packingRoute, {parcelId: 'BW-PARCEL-OTHER',
              items: [{orderItemId: listed.id, packedQuantity: 1}]}, facilityToken, 403);
            await one('Restore correct Facility packing assignment', admin.from('facility_employees')
              .update({facility_id: source.facility_id}).eq('profile_id', facilityProfileId).select('id').single());
            await call('POST', packingRoute, {parcelId: 'BW-PARCEL-MISSING',
              items: [{orderItemId: listed.id, packedQuantity: 0}]}, facilityToken, 409);
            await call('POST', qcRoute, {approved: true, notes: 'Inspected but unpacked'}, managerToken, 409);
          }
          const parcelId = `BW-PARCEL-${Date.now()}`;
          const packed = await call('POST', packingRoute, {parcelId,
            items: [{orderItemId: listed.id, packedQuantity: 1}], notes: 'Fictional final packing audit'}, facilityToken, 201);
          if (packed.parcelId !== parcelId || packed.packedCount !== 1 || packed.cycleNumber !== 2) {
            throw new Error('Final packing result incorrect');
          }
          await call('POST', packingRoute, {parcelId,
            items: [{orderItemId: listed.id, packedQuantity: 1}]}, facilityToken, 409);
          const packingHistory = await call('GET', packingRoute, undefined, facilityToken, 200);
          if (packingHistory.canPack || packingHistory.history.length !== 1 ||
              packingHistory.history[0].packed_by !== facilityProfileId ||
              !packingHistory.history[0].packed_at || packingHistory.history[0].items[0].packed_quantity !== 1) {
            throw new Error('Packing audit incomplete');
          }
          const passed = await call('POST', qcRoute, {approved: true, notes: 'Manager inspected final pack-prep'}, managerToken, 201);
          const finalHistory = await call('GET', `/facility/orders/${orderId}/processing`, undefined, managerToken, 200);
          const finalCustomer = await call('GET', `/orders/${orderId}`, undefined, customerToken, 200);
          if (passed.orderStatus !== 'ready_for_delivery' || finalCustomer.current_status !== 'ready_for_delivery' ||
              finalHistory.qualityDecisions.length !== 3 || finalHistory.rewashCycle !== 2 ||
              finalHistory.qualityDecisions.filter(decision => decision.rewash_required).length !== 2 ||
              finalHistory.stages.length !== 15) throw new Error('Final QC audit or customer lifecycle incorrect');
          await call('POST', qcRoute, {approved: true}, managerToken, 409);
          if (process.env.BW_8F_ACCEPTANCE === '1') {
            const live = await admin.from('driver_live_locations').select('*').eq('driver_id', driverRow.id).maybeSingle();
            if (live.error) throw new Error('Fictional driver location snapshot unavailable');
            driverLiveBefore = live.data;
            const staged = await admin.rpc('upsert_driver_live_location', {
              p_driver_id: driverRow.id, p_latitude: 17.4, p_longitude: 78.4, p_accuracy_m: 8,
            });
            if (staged.error) throw new Error('Fictional local delivery candidate unavailable');
            driverLocationStaged = true;
            const assigned = await call('POST', `/orders/${orderId}/assign-driver`,
              {assignmentType: 'delivery'}, adminToken, 201);
            if (!assigned || (assigned.orderId && assigned.orderId !== orderId)) {
              throw new Error('Ready order not visible to delivery assignment');
            }
            console.log('PASS: count-matched final packing, parcel audit, duplicate and cross-Facility guards, QC-gated readiness and delivery assignment');
          }
          console.log('PASS: Manager-only QC, item defect audit, two separate rewash cycles, loop cap and final Ready-for-Delivery');
        }
      } else {
        console.log('PASS: Manager-only reconciliation retained; no washing or processing state started');
      }
    }
  } finally {
    if (driverLocationStaged && driverRow) {
      const restored = driverLiveBefore
        ? await admin.rpc('upsert_driver_live_location', {p_driver_id: driverRow.id,
          p_latitude: driverLiveBefore.latitude, p_longitude: driverLiveBefore.longitude,
          p_accuracy_m: driverLiveBefore.accuracy_m})
        : await admin.from('driver_live_locations').delete().eq('driver_id', driverRow.id);
      if (restored.error) process.exitCode = 1;
    }
    if (orderId) {
      const navigation = await admin.from('driver_navigation_events').delete().eq('order_id', orderId);
      const deleted = navigation.error ? null : await admin.from('orders').delete().eq('id', orderId);
      if (navigation.error || deleted?.error) {console.error(`FAIL: fictional order cleanup failed (${navigation.error?.code || deleted?.error?.code})`); process.exitCode = 1;}
    }
    if (deliveryAddressId) {
      const deleted = await admin.from('customer_addresses').delete().eq('id', deliveryAddressId);
      if (deleted.error) process.exitCode = 1;
    }
    for (const row of [driverRow, wrongDriverRow]) if (row) {
      const restored = await admin.from('drivers').update({is_available: row.is_available}).eq('id', row.id);
      if (restored.error) process.exitCode = 1;
    }
    for (const [profileId, before] of [[driverProfileId, driverBefore], [wrongProfileId, wrongBefore]]) {
      if (profileId && before && adminToken) await call('PATCH', `/admin/staff/${profileId}/${before.is_active ? 'activate' : 'deactivate'}`, undefined, adminToken, 200).catch(() => {process.exitCode = 1;});
    }
    if (facilityProfileId && facilityEmployeeBefore) {
      const restored = await admin.from('facility_employees').update({facility_id: facilityEmployeeBefore.facility_id, is_active: facilityEmployeeBefore.is_active}).eq('profile_id', facilityProfileId);
      if (restored.error) process.exitCode = 1;
    }
    if (facilityProfileId && facilityBefore && adminToken) await call('PATCH', `/admin/staff/${facilityProfileId}/${facilityBefore.is_active ? 'activate' : 'deactivate'}`, undefined, adminToken, 200).catch(() => {process.exitCode = 1;});
    if (managerProfileId && managerEmployeeBefore) {
      const restored = await admin.from('facility_employees').update({facility_id: managerEmployeeBefore.facility_id,
        is_active: managerEmployeeBefore.is_active}).eq('profile_id', managerProfileId);
      if (restored.error) process.exitCode = 1;
    }
    if (managerProfileId && managerBefore && adminToken) await call('PATCH',
      `/admin/staff/${managerProfileId}/${managerBefore.is_active ? 'activate' : 'deactivate'}`,
      undefined, adminToken, 200).catch(() => {process.exitCode = 1;});
    if (localFacilityId) {
      const removed = await admin.from('facilities').delete().eq('id', localFacilityId);
      if (removed.error) process.exitCode = 1;
    }
    await admin.auth.admin.deleteUser(adminId);
  }
}
main().catch(error => {console.error(`FAIL: ${error.message}`); process.exitCode = 1;});
