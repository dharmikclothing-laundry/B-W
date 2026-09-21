/* Fictional local-only 7G delivery acceptance. */
const fs = require('fs');
const path = require('path');
require('dotenv').config({path: path.join(__dirname, '..', '.env'), quiet: true});
const {createClient} = require('@supabase/supabase-js');
const local = value => {try {return ['localhost', '127.0.0.1', '::1'].includes(new URL(value).hostname);} catch {return false;}};
if (!local(process.env.SUPABASE_URL) || process.env.NODE_ENV === 'production' ||
    process.env.GOOGLE_MAPS_MODE !== 'mock' || process.env.RAZORPAY_MODE !== 'mock') {
  throw new Error('7G acceptance requires local Supabase and mock providers');
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
  const adminEmail = `bw-7g-admin-${Date.now()}@example.test`;
  const created = await admin.auth.admin.createUser({email: adminEmail, email_confirm: true, user_metadata: {full_name: '7E Local Admin'}});
  if (created.error || !created.data.user) throw new Error('Local Admin fixture unavailable');
  const adminId = created.data.user.id;
  let orderId, driverProfileId, driverBefore, driverRow, wrongProfileId, wrongBefore, wrongDriverRow, adminToken;
  let facilityProfileId, facilityBefore, facilityEmployeeBefore, localFacilityId, proofPath;
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
    const destination = await one('7G local facility', admin.from('facilities').insert({name: `7G Fictional Facility ${Date.now()}`, address: '1 Fictional Road', latitude: 17.385, longitude: 78.4867, is_active: true}).select('id').single());
    localFacilityId = destination.id;
    source.facility_id = destination.id;
    const order = await one('Fictional order', admin.from('orders').insert({order_number: `BW-7G-${Date.now()}`, customer_id: customerRow.id, facility_id: source.facility_id, pickup_address_id: source.pickup_address_id, delivery_address_id: source.delivery_address_id}).select('id').single());
    orderId = order.id;
    await one('Fictional QR', admin.from('order_qr_codes').insert({order_id: orderId}).select('id').single());
    await one('Fictional garment', admin.from('order_items').insert({order_id: orderId, item_name: 'Fictional shirts', quantity: 2, weight_kg: 1.5, unit_price: 0, line_total: 0}).select('id').single());
    const confirmed = await admin.rpc('change_order_status', {p_order_id: orderId, p_new_status: 'confirmed', p_reason: '7E local fixture'});
    if (confirmed.error) throw new Error(`Approved confirmation failed (${confirmed.error.code})`);
    const assigned = await one('Pickup assignment', admin.rpc('create_driver_assignment_atomic', {p_order_id: orderId, p_driver_id: driverRow.id, p_assignment_type: 'pickup', p_assignment_score: 0}));
    const assignmentId = assigned.assignment.id;
    const driverToken = await login('+16505550102');
    const customerToken = await login('+16505550101');
    const wrongEmail = wrongDriver.email || `bw-7g-other-${Date.now()}@example.test`;
    if (!wrongDriver.email) {
      const updated = await admin.auth.admin.updateUserById(wrongDriver.id, {email: wrongEmail, email_confirm: true});
      if (updated.error) throw new Error('Other Driver local email setup failed');
    }
    const wrongLink = await admin.auth.admin.generateLink({type: 'magiclink', email: wrongEmail});
    const wrongSession = await publicAuth.auth.verifyOtp({token_hash: wrongLink.data?.properties?.hashed_token, type: 'magiclink'});
    const wrongToken = wrongSession.data?.session?.access_token;
    if (!wrongToken) throw new Error('Other Driver login failed');
    const facilityEmail = facilityUser.email || `bw-7g-facility-${Date.now()}@example.test`;
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
    await call('GET', `/drivers/me/assignments/${assignmentId}/handoff-qr`, undefined, wrongToken, 404);
    await call('GET', `/qr/orders/${orderId}`, undefined, wrongToken, 403);
    console.log('PASS: only owning Driver can start facility transit and display its handoff code');
    if (!wrongFacility) throw new Error('Wrong-facility fixture is unavailable');
    await call('POST', '/facility/receive/qr', {token: code.payload}, facilityToken, 403);
    console.log('PASS: wrong facility and legacy cross-Driver QR lookup are rejected');
    await one('Correct Facility fixture', admin.from('facility_employees').update({facility_id: source.facility_id}).eq('profile_id', facilityProfileId).select('id').single());
    await call('POST', '/facility/receive/qr', {token: 'BW1:00000000-0000-4000-8000-000000000000'}, facilityToken, 404);
    const receipt = await call('POST', '/facility/receive/qr', {token: code.payload}, facilityToken, 201);
    if (!receipt.received || receipt.orderStatus !== 'received_at_facility' || receipt.pickupAssignmentStatus !== 'completed') throw new Error('Atomic facility receipt failed');
    await call('POST', '/facility/receive/qr', {token: code.payload}, facilityToken, 409);
    await call('GET', `/drivers/me/assignments/${assignmentId}/handoff-qr`, undefined, driverToken, 409);
    const finalOrder = await call('GET', `/orders/${orderId}`, undefined, customerToken, 200);
    const finalJob = await call('GET', `/drivers/me/assignments/${assignmentId}`, undefined, driverToken, 200);
    const queue = await one('Facility processing queue', admin.from('facility_order_operations').select('order_id,facility_id,current_status').eq('order_id', orderId).single());
    if (finalOrder.current_status !== 'received_at_facility' || finalJob.assignmentStatus !== 'completed' ||
        queue.facility_id !== source.facility_id || queue.current_status !== 'received') throw new Error('Customer, Driver or Facility queue failed to reflect handoff');
    console.log('PASS: Facility confirms once; customer, Driver and Facility processing queue reflect atomic receipt');
    const intake = await call('GET', `/facility/orders/${orderId}/intake`, undefined, facilityToken, 200);
    await call('POST', `/facility/orders/${orderId}/intake-verify`, {items: intake.items.map(item => ({
      orderItemId: item.id, countedQuantity: item.quantity, weightKg: item.weight_kg == null ? null : Number(item.weight_kg),
    })), notes: '7G fictional verification'}, facilityToken, 201);
    for (const processType of ['washing', 'drying', 'ironing', 'folding', 'packaging']) {
      const started = await call('POST', `/facility/orders/${orderId}/processing`, {processType}, facilityToken, 201);
      const operationId = started.operationId || started.id;
      if (!operationId) throw new Error(`${processType} operation unavailable`);
      await call('POST', `/facility/operations/${operationId}/complete`, undefined, facilityToken, 201);
    }
    const quality = await call('POST', `/facility/orders/${orderId}/quality-check`, {approved: true, notes: '7G fictional quality approval'}, facilityToken, 201);
    if (quality.facilityStatus !== 'ready_for_delivery') throw new Error('Facility did not mark order ready for delivery');
    console.log('PASS: existing Facility processing sequence marks order ready for delivery');
    const deliveryAssigned = await one('Delivery assignment', admin.rpc('create_driver_assignment_atomic', {p_order_id: orderId, p_driver_id: driverRow.id, p_assignment_type: 'delivery', p_assignment_score: 0}));
    const deliveryAssignmentId = deliveryAssigned.assignment.id;
    await call('POST', `/driver-assignments/${deliveryAssignmentId}/accept`, undefined, wrongToken, 404);
    await call('POST', `/driver-assignments/${deliveryAssignmentId}/accept`, undefined, driverToken, 201);
    await call('POST', `/driver-assignments/${deliveryAssignmentId}/navigation`, undefined, driverToken, 201);
    await call('POST', `/drivers/me/location`, {assignmentId: deliveryAssignmentId, latitude: 17.41, longitude: 78.41, accuracyM: 8}, driverToken, 201);
    const activeTracking = await call('GET', `/orders/${orderId}/tracking`, undefined, customerToken, 200);
    if (activeTracking.assignment?.id !== deliveryAssignmentId || !activeTracking.location) throw new Error('Customer cannot see active delivery location');
    await call('POST', `/driver-assignments/${deliveryAssignmentId}/arrive`, undefined, driverToken, 201);
    const arrival = await call('GET', `/drivers/me/assignments/${deliveryAssignmentId}`, undefined, driverToken, 200);
    if (arrival.orderStatus !== 'delivery_otp_pending' || arrival.assignmentStatus !== 'arrived') throw new Error('Driver did not reach delivery handover');
    console.log('PASS: assigned Driver accepts, navigates, publishes GPS and reaches delivery handover');
    const issuedDeliveryOtp = await call('POST', `/orders/${orderId}/otp`, {otpType: 'delivery'}, customerToken, 201);
    await call('POST', `/orders/${orderId}/complete-delivery`, {otp: issuedDeliveryOtp.otp}, driverToken, 400);
    await call('POST', `/orders/${orderId}/complete-delivery`, {otp: issuedDeliveryOtp.otp, photoPath: `${orderId}/missing.jpg`}, wrongToken, 409);
    const upload = await call('POST', `/orders/${orderId}/delivery-proof/upload-url`, {fileName: 'fictional-proof.png'}, driverToken, 201);
    if (!upload.path || !upload.token || !upload.path.startsWith(`${orderId}/`)) throw new Error('Scoped delivery proof upload unavailable');
    proofPath = upload.path;
    const proofBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6SxkAAAAASUVORK5CYII=', 'base64');
    const proofUpload = await publicAuth.storage.from('delivery-proofs').uploadToSignedUrl(upload.path, upload.token, proofBytes, {contentType: 'image/png'});
    if (proofUpload.error) throw new Error(`Local proof upload failed (${proofUpload.error.message})`);
    await call('POST', `/orders/${orderId}/complete-delivery`, {otp: '000000', photoPath: proofPath}, driverToken, 400);
    const expiredDelivery = await admin.from('order_otps').update({expires_at: new Date(Date.now() - 60_000).toISOString()}).eq('id', issuedDeliveryOtp.otpId);
    if (expiredDelivery.error) throw new Error(`Local delivery OTP expiry setup failed (${expiredDelivery.error.code})`);
    await call('POST', `/orders/${orderId}/complete-delivery`, {otp: issuedDeliveryOtp.otp, photoPath: proofPath}, driverToken, 400);
    const validDeliveryOtp = await call('POST', `/orders/${orderId}/otp`, {otpType: 'delivery'}, customerToken, 201);
    const completion = await call('POST', `/orders/${orderId}/complete-delivery`, {otp: validDeliveryOtp.otp, photoPath: proofPath}, driverToken, 201);
    if (!completion.delivered || completion.orderStatus !== 'claim_period_active' || completion.assignmentStatus !== 'completed') throw new Error('Atomic delivery completion failed');
    await call('POST', `/orders/${orderId}/complete-delivery`, {otp: validDeliveryOtp.otp, photoPath: proofPath}, driverToken, 409);
    const deliveredOrder = await call('GET', `/orders/${orderId}`, undefined, customerToken, 200);
    const deliveredJob = await call('GET', `/drivers/me/assignments/${deliveryAssignmentId}`, undefined, driverToken, 200);
    const trackingEnded = await call('GET', `/orders/${orderId}/tracking`, undefined, customerToken, 200);
    const proof = await one('Retained delivery proof', admin.from('delivery_proofs').select('order_id,photo_path').eq('order_id', orderId).single());
    if (deliveredOrder.current_status !== 'claim_period_active' || !deliveredOrder.delivered_at ||
        deliveredJob.assignmentStatus !== 'completed' || trackingEnded.location || trackingEnded.assignment ||
        proof.photo_path !== proofPath) throw new Error('Delivered order, Driver queue, proof or tracking state incorrect');
    await call('POST', `/drivers/me/location`, {assignmentId: deliveryAssignmentId, latitude: 17.42, longitude: 78.42, accuracyM: 8}, driverToken, 409);
    const dashboardAfter = await call('GET', '/drivers/me/dashboard', undefined, driverToken, 200);
    if (dashboardAfter.deliveries?.some(job => job.id === deliveryAssignmentId && job.assignmentStatus !== 'completed')) throw new Error('Delivery remains in active Driver queue');
    console.log('PASS: missing, wrong, expired and reused OTP rejected; photo required; atomic delivery completes once');
    console.log('PASS: customer sees delivery, proof remains stored, Driver assignment completes and GPS tracking stops');
  } finally {
    if (proofPath) {
      const removedProof = await admin.storage.from('delivery-proofs').remove([proofPath]);
      if (removedProof.error) process.exitCode = 1;
    }
    if (orderId) {
      const navigation = await admin.from('driver_navigation_events').delete().eq('order_id', orderId);
      const deleted = navigation.error ? null : await admin.from('orders').delete().eq('id', orderId);
      if (navigation.error || deleted?.error) {console.error(`FAIL: fictional order cleanup failed (${navigation.error?.code || deleted?.error?.code})`); process.exitCode = 1;}
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
    if (localFacilityId) {
      const removed = await admin.from('facilities').delete().eq('id', localFacilityId);
      if (removed.error) process.exitCode = 1;
    }
    await admin.auth.admin.deleteUser(adminId);
  }
}
main().catch(error => {console.error(`FAIL: ${error.message}`); process.exitCode = 1;});
