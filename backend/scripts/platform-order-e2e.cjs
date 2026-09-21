/* Full local/mock cross-role acceptance for an app-created Customer order. */
const fs = require("fs");
const path = require("path");
require("dotenv").config({
  path: path.join(__dirname, "..", ".env"),
  quiet: true,
});
const { createClient } = require("@supabase/supabase-js");

const local = (value) => {
  try {
    return ["localhost", "127.0.0.1", "::1"].includes(new URL(value).hostname);
  } catch {
    return false;
  }
};
if (
  !local(process.env.SUPABASE_URL) ||
  process.env.NODE_ENV === "production" ||
  process.env.GOOGLE_MAPS_MODE !== "mock" ||
  process.env.RAZORPAY_MODE !== "mock"
) {
  throw new Error(
    "platform-order-e2e requires local Supabase and mock providers",
  );
}
const api = process.env.BW_E2E_API_URL || "http://127.0.0.1:3000/v1";
if (!local(api)) throw new Error("platform-order-e2e API must be local");
const service = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const anonKey =
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
const auth = createClient(process.env.SUPABASE_URL, anonKey, {
  auth: { persistSession: false },
});
const config = fs.readFileSync(
  path.join(__dirname, "..", "supabase/config.toml"),
  "utf8",
);
const otp = (phone) =>
  config.match(new RegExp(`^${phone}\\s*=\\s*"(\\d+)"`, "m"))?.[1];
const digits = (value) => String(value || "").replace(/\D/g, "");
const phones = {
  customer: "16505550101",
  driver: "16505550102",
  facility: "16505550103",
  manager: "16505550104",
  wrongDriver: "16505550105",
  admin: "16505550106",
};
const pass = (message) => console.log(`PASS: ${message}`);
async function one(label, query) {
  const { data, error } = await query;
  if (error || !data)
    throw new Error(`${label}: ${error?.message || "missing"}`);
  return data;
}
async function call(method, route, body, token, expected = 200) {
  const response = await fetch(`${api}${route}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (response.status !== expected) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(
      `${method} ${route}: expected ${expected}, got ${response.status} (${String(detail.message || "no detail")})`,
    );
  }
  return response.json().catch(() => ({}));
}
async function login(phone) {
  const token = otp(phone);
  if (!token) throw new Error(`Local OTP missing for ${phone}`);
  const requested = await auth.auth.signInWithOtp({ phone: `+${phone}` });
  if (requested.error) throw requested.error;
  const verified = await auth.auth.verifyOtp({
    phone: `+${phone}`,
    token,
    type: "sms",
  });
  if (verified.error || !verified.data.session?.access_token)
    throw new Error(`Local login failed for ${phone}`);
  return verified.data.session.access_token;
}
async function magicLinkLogin(user, label) {
  const email = user.email || `bw-platform-${label}-${Date.now()}@example.test`;
  if (!user.email) {
    const updated = await service.auth.admin.updateUserById(user.id, {
      email,
      email_confirm: true,
    });
    if (updated.error) throw updated.error;
  }
  const link = await service.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (link.error || !link.data?.properties?.hashed_token)
    throw link.error || new Error(`Local magic link missing for ${label}`);
  const verified = await auth.auth.verifyOtp({
    token_hash: link.data.properties.hashed_token,
    type: "magiclink",
  });
  if (verified.error || !verified.data.session?.access_token)
    throw verified.error || new Error(`Local login failed for ${label}`);
  return verified.data.session.access_token;
}
async function findUser(phone) {
  const users = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) throw users.error;
  const user = users.data.users.find((item) => digits(item.phone) === phone);
  if (!user) throw new Error(`Fictional user missing: ${phone}`);
  return user;
}

async function main() {
  const customerUser = await findUser(phones.customer);
  const driverUser = await findUser(phones.driver);
  const facilityUser = await findUser(phones.facility);
  const managerUser = await findUser(phones.manager);
  const wrongDriverUser = await findUser(phones.wrongDriver);
  const adminUser = await findUser(phones.admin);
  const customer = await one(
    "Customer",
    service
      .from("customers")
      .select("id")
      .eq("profile_id", customerUser.id)
      .single(),
  );
  let orderQuery = service
    .from("orders")
    .select("*")
    .eq("customer_id", customer.id)
    .eq("current_status", "pickup_assigned")
    .order("created_at", { ascending: false })
    .limit(1);
  if (process.env.BW_E2E_ORDER_ID)
    orderQuery = service
      .from("orders")
      .select("*")
      .eq("id", process.env.BW_E2E_ORDER_ID)
      .single();
  const orderResult = await orderQuery;
  const order = Array.isArray(orderResult.data)
    ? orderResult.data[0]
    : orderResult.data;
  if (orderResult.error || !order)
    throw new Error(
      `App-created pickup-assigned order unavailable (${orderResult.error?.message || "missing"})`,
    );
  const payment = await one(
    "Paid mock payment",
    service
      .from("payment_orders")
      .select("status,provider,paid_at")
      .eq("order_id", order.id)
      .eq("status", "paid")
      .single(),
  );
  const qr = await one(
    "Active order QR",
    service
      .from("order_qr_codes")
      .select("id,is_active")
      .eq("order_id", order.id)
      .eq("is_active", true)
      .single(),
  );
  const pickup = await one(
    "Automatic pickup assignment",
    service
      .from("driver_assignments")
      .select("*")
      .eq("order_id", order.id)
      .eq("assignment_type", "pickup")
      .eq("status", "assigned")
      .single(),
  );
  const driver = await one(
    "Arjun Rao driver",
    service
      .from("drivers")
      .select("*")
      .eq("profile_id", driverUser.id)
      .single(),
  );
  if (
    pickup.driver_id !== driver.id ||
    payment.provider !== "mock" ||
    !qr.is_active
  )
    throw new Error(
      "App order payment, QR, or automatic pickup Driver mismatch",
    );
  pass(
    `Android app order ${order.order_number} is paid, QR-enabled, and automatically assigned to Arjun Rao`,
  );

  const managerProfile = await one(
    "Manager profile",
    service
      .from("profiles")
      .select("is_active")
      .eq("id", managerUser.id)
      .single(),
  );
  const managerEmployee = await one(
    "Manager employee",
    service
      .from("facility_employees")
      .select("*")
      .eq("profile_id", managerUser.id)
      .single(),
  );
  const facilityEmployee = await one(
    "Facility employee",
    service
      .from("facility_employees")
      .select("*")
      .eq("profile_id", facilityUser.id)
      .single(),
  );
  const wrongDriverProfile = await one(
    "Other Driver profile",
    service
      .from("profiles")
      .select("is_active")
      .eq("id", wrongDriverUser.id)
      .single(),
  );
  const wrongDriver = await one(
    "Other Driver account",
    service
      .from("drivers")
      .select("id,is_active,is_available")
      .eq("profile_id", wrongDriverUser.id)
      .single(),
  );
  const driverBefore = { is_available: driver.is_available };
  let wrongFacilityId = null;
  try {
    await one(
      "Manager activation",
      service
        .from("profiles")
        .update({ is_active: true })
        .eq("id", managerUser.id)
        .select("id")
        .single(),
    );
    await one(
      "Manager employee activation",
      service
        .from("facility_employees")
        .update({ is_active: true, facility_id: order.facility_id })
        .eq("profile_id", managerUser.id)
        .select("id")
        .single(),
    );
    await one(
      "Facility employee alignment",
      service
        .from("facility_employees")
        .update({ is_active: true, facility_id: order.facility_id })
        .eq("profile_id", facilityUser.id)
        .select("id")
        .single(),
    );
    await one(
      "Other Driver activation",
      service
        .from("profiles")
        .update({ is_active: true })
        .eq("id", wrongDriverUser.id)
        .select("id")
        .single(),
    );
    await one(
      "Other Driver account activation",
      service
        .from("drivers")
        .update({ is_active: true })
        .eq("id", wrongDriver.id)
        .select("id")
        .single(),
    );

    const [
      customerToken,
      driverToken,
      facilityToken,
      managerToken,
      wrongDriverToken,
      adminToken,
    ] = await Promise.all([
      login(phones.customer),
      login(phones.driver),
      login(phones.facility),
      login(phones.manager),
      magicLinkLogin(wrongDriverUser, "wrong-driver"),
      login(phones.admin),
    ]);
    const dashboard = await call(
      "GET",
      "/drivers/me/dashboard",
      null,
      driverToken,
    );
    if (
      !dashboard.pickups?.some(
        (job) => job.id === pickup.id && job.orderId === order.id,
      )
    )
      throw new Error("Automatic pickup missing from Arjun Rao dashboard");
    await call(
      "GET",
      `/drivers/me/assignments/${pickup.id}`,
      null,
      wrongDriverToken,
      404,
    );
    await call(
      "POST",
      `/driver-assignments/${pickup.id}/accept`,
      null,
      wrongDriverToken,
      404,
    );
    await call(
      "POST",
      `/driver-assignments/${pickup.id}/reject`,
      { reason: "Unauthorized" },
      wrongDriverToken,
      404,
    );
    await call(
      "POST",
      `/driver-assignments/${pickup.id}/accept`,
      null,
      driverToken,
      201,
    );
    await call(
      "POST",
      `/driver-assignments/${pickup.id}/accept`,
      null,
      driverToken,
      409,
    );
    await call(
      "POST",
      `/driver-assignments/${pickup.id}/reject`,
      { reason: "Stale decision" },
      driverToken,
      409,
    );
    pass(
      "Driver pickup visibility, ownership, Accept, duplicate and stale decision rules",
    );

    await call(
      "POST",
      `/driver-assignments/${pickup.id}/navigation`,
      null,
      driverToken,
      201,
    );
    await call(
      "POST",
      "/drivers/me/location",
      {
        assignmentId: pickup.id,
        latitude: 17.385,
        longitude: 78.4867,
        accuracyM: 8,
      },
      driverToken,
      201,
    );
    const tracking = await call(
      "GET",
      `/orders/${order.id}/tracking`,
      null,
      customerToken,
    );
    if (tracking.assignment?.id !== pickup.id || !tracking.location)
      throw new Error(
        "Customer pickup tracking did not receive assigned Driver location",
      );
    await call(
      "POST",
      `/driver-assignments/${pickup.id}/arrive`,
      null,
      driverToken,
      201,
    );
    pass("Pickup navigation transition and assignment-scoped GPS tracking");

    const pickupOtp = await call(
      "POST",
      `/orders/${order.id}/otp`,
      { otpType: "pickup" },
      customerToken,
      201,
    );
    await call(
      "POST",
      `/orders/${order.id}/otp/verify`,
      { otpType: "pickup", otp: pickupOtp.otp },
      wrongDriverToken,
      403,
    );
    await call(
      "POST",
      `/orders/${order.id}/otp/verify`,
      { otpType: "pickup", otp: "000000" },
      driverToken,
      400,
    );
    await service
      .from("order_otps")
      .update({ expires_at: new Date(Date.now() - 60000).toISOString() })
      .eq("id", pickupOtp.otpId);
    await call(
      "POST",
      `/orders/${order.id}/otp/verify`,
      { otpType: "pickup", otp: pickupOtp.otp },
      driverToken,
      400,
    );
    const freshPickupOtp = await call(
      "POST",
      `/orders/${order.id}/otp`,
      { otpType: "pickup" },
      customerToken,
      201,
    );
    await call(
      "POST",
      `/orders/${order.id}/otp/verify`,
      { otpType: "pickup", otp: freshPickupOtp.otp },
      driverToken,
      201,
    );
    await call(
      "POST",
      `/orders/${order.id}/otp/verify`,
      { otpType: "pickup", otp: freshPickupOtp.otp },
      driverToken,
      409,
    );
    pass(
      "Pickup OTP wrong, expired, wrong-Driver and reuse rejection; valid atomic pickup",
    );

    await call(
      "POST",
      `/driver-assignments/${pickup.id}/facility-transit`,
      null,
      wrongDriverToken,
      404,
    );
    await call(
      "POST",
      `/driver-assignments/${pickup.id}/facility-transit`,
      null,
      driverToken,
      201,
    );
    const handoff = await call(
      "GET",
      `/drivers/me/assignments/${pickup.id}/handoff-qr`,
      null,
      driverToken,
    );
    if (!handoff.payload?.startsWith("BW1:"))
      throw new Error("Facility handoff QR unavailable");
    await call(
      "POST",
      "/facility/receive/qr",
      { token: handoff.payload },
      customerToken,
      403,
    );
    const wrongFacility = await one(
      "Temporary wrong Facility",
      service
        .from("facilities")
        .insert({
          name: `Cross-role wrong facility ${Date.now()}`,
          address: "Local Development only",
          latitude: 17.4,
          longitude: 78.5,
          is_active: true,
        })
        .select("id")
        .single(),
    );
    wrongFacilityId = wrongFacility.id;
    await one(
      "Wrong Facility staff alignment",
      service
        .from("facility_employees")
        .update({ facility_id: wrongFacilityId })
        .eq("profile_id", facilityUser.id)
        .select("id")
        .single(),
    );
    await call(
      "POST",
      "/facility/receive/qr",
      { token: handoff.payload },
      facilityToken,
      403,
    );
    await call(
      "POST",
      "/facility/receive/order-id/preview",
      { orderNumber: order.order_number },
      facilityToken,
      403,
    );
    await one(
      "Correct Facility staff restore",
      service
        .from("facility_employees")
        .update({ facility_id: order.facility_id })
        .eq("profile_id", facilityUser.id)
        .select("id")
        .single(),
    );
    await call(
      "POST",
      "/facility/receive/preview",
      { token: handoff.payload },
      facilityToken,
      201,
    );
    await call(
      "POST",
      "/facility/receive/order-id/preview",
      { orderNumber: order.order_number.toLowerCase() },
      facilityToken,
      201,
    );
    await call(
      "POST",
      "/facility/receive/qr",
      { token: "BW1:00000000-0000-4000-8000-000000000000" },
      facilityToken,
      404,
    );
    await call(
      "POST",
      "/facility/receive/order-id",
      { orderNumber: order.order_number },
      facilityToken,
      201,
    );
    await call(
      "POST",
      "/facility/receive/qr",
      { token: handoff.payload },
      facilityToken,
      409,
    );
    pass(
      "Driver-to-Facility QR scan and Order ID receipt, wrong role/facility, bad code and duplicate controls",
    );

    const intake = await call(
      "GET",
      `/facility/orders/${order.id}/intake`,
      null,
      facilityToken,
    );
    await call(
      "POST",
      `/facility/orders/${order.id}/processing`,
      { processType: "washing" },
      facilityToken,
      409,
    );
    const originalItems = await one(
      "Checkout items",
      service
        .from("order_items")
        .select("id,quantity,weight_kg")
        .eq("order_id", order.id),
    );
    await call(
      "POST",
      `/facility/orders/${order.id}/intake-verify`,
      {
        items: intake.items.map((item) => ({
          orderItemId: item.id,
          countedQuantity: item.quantity,
          weightKg: item.weight_kg == null ? null : Number(item.weight_kg),
          damaged: false,
        })),
        notes: "Cross-role local intake matched",
      },
      facilityToken,
      201,
    );
    const afterItems = await one(
      "Unchanged checkout items",
      service
        .from("order_items")
        .select("id,quantity,weight_kg")
        .eq("order_id", order.id),
    );
    if (JSON.stringify(originalItems) !== JSON.stringify(afterItems))
      throw new Error("Facility intake changed checkout order items");
    pass(
      "Garment quantities/weight verified separately with checkout items unchanged",
    );

    const stages = ["washing", "drying", "ironing", "folding", "packaging"];
    await call(
      "POST",
      `/facility/orders/${order.id}/processing`,
      { processType: "drying" },
      facilityToken,
      409,
    );
    for (const [index, stage] of stages.entries()) {
      const started = await call(
        "POST",
        `/facility/orders/${order.id}/processing`,
        { processType: stage },
        facilityToken,
        201,
      );
      await call(
        "POST",
        `/facility/orders/${order.id}/processing`,
        { processType: stage },
        facilityToken,
        409,
      );
      if (index < stages.length - 1)
        await call(
          "POST",
          `/facility/orders/${order.id}/processing`,
          { processType: stages[index + 1] },
          facilityToken,
          409,
        );
      await call(
        "POST",
        `/facility/operations/${started.operationId}/complete`,
        null,
        facilityToken,
        201,
      );
      await call(
        "POST",
        `/facility/operations/${started.operationId}/complete`,
        null,
        facilityToken,
        409,
      );
    }
    const processing = await call(
      "GET",
      `/facility/orders/${order.id}/processing`,
      null,
      facilityToken,
    );
    if (
      processing.stages.length !== 5 ||
      processing.stages.some(
        (stage) => !stage.started_at || !stage.completed_at,
      )
    )
      throw new Error("Processing stage audit incomplete");
    pass(
      "Wash → Dry → Iron → Fold → Pack-prep sequence, skip and duplicate controls, operator/time audit",
    );

    const packing = await call(
      "GET",
      `/facility/orders/${order.id}/packing`,
      null,
      facilityToken,
    );
    if (!packing.canPack || !packing.items?.length)
      throw new Error(
        "Final packing was not available after verified processing",
      );
    await call(
      "POST",
      `/facility/orders/${order.id}/packing`,
      {
        items: packing.items.map((item) => ({
          orderItemId: item.id,
          packedQuantity: item.verifiedQuantity,
        })),
        notes: "Cross-role local final packing",
      },
      facilityToken,
      201,
    );
    await call(
      "POST",
      `/facility/orders/${order.id}/packing`,
      {
        items: packing.items.map((item) => ({
          orderItemId: item.id,
          packedQuantity: item.verifiedQuantity,
        })),
      },
      facilityToken,
      409,
    );
    const qc = await call(
      "POST",
      `/facility/orders/${order.id}/quality-check`,
      { approved: true, notes: "Facility Staff approved the verified packing" },
      facilityToken,
      201,
    );
    if (qc.orderStatus !== "delivery_assigned") {
      const row = await one(
        "Ready order after QC",
        service
          .from("orders")
          .select("current_status")
          .eq("id", order.id)
          .single(),
      );
      if (row.current_status !== "delivery_assigned")
        throw new Error(
          `Ready-for-delivery did not auto-assign (${row.current_status})`,
        );
    }
    const delivery = await one(
      "Automatic delivery assignment",
      service
        .from("driver_assignments")
        .select("*")
        .eq("order_id", order.id)
        .eq("assignment_type", "delivery")
        .eq("status", "assigned")
        .single(),
    );
    if (delivery.driver_id !== driver.id)
      throw new Error("Automatic delivery Driver is not Arjun Rao");
    pass(
      "Final packing without parcel entry, Facility Staff QC PASS, Ready for Delivery and automatic delivery assignment to Arjun Rao",
    );

    const deliveryDashboard = await call(
      "GET",
      "/drivers/me/dashboard",
      null,
      driverToken,
    );
    if (!deliveryDashboard.deliveries?.some((job) => job.id === delivery.id))
      throw new Error("Delivery assignment missing from Driver dashboard");
    await call(
      "POST",
      `/driver-assignments/${delivery.id}/accept`,
      null,
      wrongDriverToken,
      404,
    );
    await call(
      "POST",
      `/driver-assignments/${delivery.id}/accept`,
      null,
      driverToken,
      201,
    );
    await call(
      "POST",
      `/driver-assignments/${delivery.id}/navigation`,
      null,
      driverToken,
      201,
    );
    await call(
      "POST",
      "/drivers/me/location",
      {
        assignmentId: delivery.id,
        latitude: 17.39,
        longitude: 78.49,
        accuracyM: 8,
      },
      driverToken,
      201,
    );
    await call(
      "POST",
      `/driver-assignments/${delivery.id}/arrive`,
      null,
      driverToken,
      201,
    );
    pass(
      "Delivery queue visibility, Accept, navigation transition and live tracking",
    );

    const deliveryOtp = await call(
      "POST",
      `/orders/${order.id}/otp`,
      { otpType: "delivery" },
      customerToken,
      201,
    );
    await call(
      "POST",
      `/orders/${order.id}/complete-delivery`,
      { otp: deliveryOtp.otp },
      driverToken,
      400,
    );
    const upload = await call(
      "POST",
      `/orders/${order.id}/delivery-proof/upload-url`,
      { fileName: "platform-order-e2e.png" },
      driverToken,
      201,
    );
    const proofBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6SxkAAAAASUVORK5CYII=",
      "base64",
    );
    const uploaded = await auth.storage
      .from("delivery-proofs")
      .uploadToSignedUrl(upload.path, upload.token, proofBytes, {
        contentType: "image/png",
      });
    if (uploaded.error) throw uploaded.error;
    await call(
      "POST",
      `/orders/${order.id}/complete-delivery`,
      { otp: "000000", photoPath: upload.path },
      driverToken,
      400,
    );
    await service
      .from("order_otps")
      .update({ expires_at: new Date(Date.now() - 60000).toISOString() })
      .eq("id", deliveryOtp.otpId);
    await call(
      "POST",
      `/orders/${order.id}/complete-delivery`,
      { otp: deliveryOtp.otp, photoPath: upload.path },
      driverToken,
      400,
    );
    const validDeliveryOtp = await call(
      "POST",
      `/orders/${order.id}/otp`,
      { otpType: "delivery" },
      customerToken,
      201,
    );
    await call(
      "POST",
      `/orders/${order.id}/complete-delivery`,
      { otp: validDeliveryOtp.otp, photoPath: upload.path },
      wrongDriverToken,
      409,
    );
    const completed = await call(
      "POST",
      `/orders/${order.id}/complete-delivery`,
      { otp: validDeliveryOtp.otp, photoPath: upload.path },
      driverToken,
      201,
    );
    await call(
      "POST",
      `/orders/${order.id}/complete-delivery`,
      { otp: validDeliveryOtp.otp, photoPath: upload.path },
      driverToken,
      409,
    );
    if (!completed.delivered || completed.orderStatus !== "claim_period_active")
      throw new Error("Atomic delivery completion failed");
    pass(
      "Delivery photo required, wrong/expired OTP and wrong Driver blocked, valid delivery completes once",
    );

    const finalOrder = await call(
      "GET",
      `/orders/${order.id}`,
      null,
      customerToken,
    );
    const paymentSummary = await call(
      "GET",
      `/payments/orders/${order.id}`,
      null,
      customerToken,
    );
    const finalTracking = await call(
      "GET",
      `/orders/${order.id}/tracking`,
      null,
      customerToken,
    );
    await call("GET", `/qr/orders/${order.id}`, null, customerToken);
    if (
      finalOrder.current_status !== "claim_period_active" ||
      !finalOrder.delivered_at ||
      paymentSummary.payment.status !== "paid" ||
      finalTracking.assignment ||
      finalTracking.location
    ) {
      throw new Error(
        "Final Customer state, payment, QR, claim period or tracking stop is incorrect",
      );
    }
    await call(
      "POST",
      "/drivers/me/location",
      {
        assignmentId: delivery.id,
        latitude: 17.4,
        longitude: 78.5,
        accuracyM: 8,
      },
      driverToken,
      409,
    );
    pass(
      "Customer final delivered/claim-period state, receipt/payment/QR and tracking stop",
    );

    const customerClient = createClient(process.env.SUPABASE_URL, anonKey, {
      global: { headers: { Authorization: `Bearer ${customerToken}` } },
      auth: { persistSession: false },
    });
    const direct = await customerClient
      .from("orders")
      .update({ current_status: "delivered" })
      .eq("id", order.id)
      .select("id");
    if (!direct.error && direct.data?.length)
      throw new Error("Customer direct order status write was not blocked");
    const history = await call(
      "GET",
      `/orders/${order.id}/status-history`,
      null,
      customerToken,
    );
    const historyStatuses = history.map((item) => item.to_status);
    for (const expected of [
      "pickup_assigned",
      "pickup_accepted",
      "pickup_otp_pending",
      "picked_up",
      "received_at_facility",
      "verification",
      "processing",
      "ready_for_delivery",
      "delivery_assigned",
      "delivery_accepted",
      "delivery_otp_pending",
      "delivered",
      "claim_period_active",
    ]) {
      if (!historyStatuses.includes(expected))
        throw new Error(`Missing lifecycle audit status ${expected}`);
    }
    const notifications = await call(
      "GET",
      "/notifications",
      null,
      customerToken,
    );
    const orderNotifications = notifications.filter(
      (item) => item.order_id === order.id,
    );
    for (const expected of [
      "pickup_assigned",
      "pickup_otp_pending",
      "picked_up",
      "received_at_facility",
      "processing",
      "ready_for_delivery",
      "en_route_delivery",
      "delivered",
      "claim_period_active",
    ]) {
      if (
        !orderNotifications.some(
          (item) =>
            item.data?.status === expected && item.data?.orderId === order.id,
        )
      ) {
        throw new Error(
          `Missing Customer notification/deep-link record ${expected}`,
        );
      }
    }
    pass(
      "Lifecycle notifications and order deep-link data retained in local records",
    );

    const adminOrder = await call(
      "GET",
      `/admin/orders/${order.id}`,
      null,
      adminToken,
    );
    const adminAssignment = await call(
      "GET",
      `/admin/assignments/orders/${order.id}`,
      null,
      adminToken,
    );
    const adminFacility = await call(
      "GET",
      `/admin/facilities/${order.facility_id}/orders/${order.id}`,
      null,
      adminToken,
    );
    if (adminOrder.order?.id !== order.id && adminOrder.id !== order.id)
      throw new Error("Admin order visibility unavailable");
    if (!adminAssignment.assignments?.length || !adminFacility.order)
      throw new Error(
        "Admin assignment or Facility audit visibility unavailable",
      );
    pass(
      "Admin observes order, both assignments, Facility operations, QC, packing and immutable history without intervention",
    );
    console.log(`RESULT_ORDER_ID=${order.id}`);
    console.log(`RESULT_ORDER_NUMBER=${order.order_number}`);
    console.log(`RESULT_PICKUP_ASSIGNMENT_ID=${pickup.id}`);
    console.log(`RESULT_DELIVERY_ASSIGNMENT_ID=${delivery.id}`);
  } finally {
    await service
      .from("profiles")
      .update({ is_active: managerProfile.is_active })
      .eq("id", managerUser.id);
    await service
      .from("facility_employees")
      .update({
        is_active: managerEmployee.is_active,
        facility_id: managerEmployee.facility_id,
      })
      .eq("profile_id", managerUser.id);
    await service
      .from("facility_employees")
      .update({
        is_active: facilityEmployee.is_active,
        facility_id: facilityEmployee.facility_id,
      })
      .eq("profile_id", facilityUser.id);
    await service
      .from("drivers")
      .update({ is_available: driverBefore.is_available })
      .eq("id", driver.id);
    await service
      .from("profiles")
      .update({ is_active: wrongDriverProfile.is_active })
      .eq("id", wrongDriverUser.id);
    await service
      .from("drivers")
      .update({
        is_active: wrongDriver.is_active,
        is_available: wrongDriver.is_available,
      })
      .eq("id", wrongDriver.id);
    if (wrongFacilityId)
      await service.from("facilities").delete().eq("id", wrongFacilityId);
  }
}
main().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
});
