const { existsSync } = require('node:fs');
const { createHmac, randomUUID } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const apiBase = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000/v1';
const supabaseUrl = process.env.SUPABASE_URL;
const anonymousKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
const serviceRoleKey =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(supabaseUrl, 'SUPABASE_URL is required');
assert(anonymousKey, 'A Supabase publishable/anonymous key is required');
assert(serviceRoleKey, 'A Supabase secret/service-role key is required');

const parsedSupabaseUrl = new URL(supabaseUrl);
assert(
  ['127.0.0.1', 'localhost'].includes(parsedSupabaseUrl.hostname),
  'Runtime gates are restricted to local Supabase',
);

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anonymous = createClient(supabaseUrl, anonymousKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function api(path, options = {}) {
  const method = options.method ?? 'GET';
  const headers = {
    accept: 'application/json',
    ...(options.headers ?? {}),
  };

  if (options.token) {
    headers.authorization = `Bearer ${options.token}`;
  }

  if (options.body !== undefined || options.rawBody !== undefined) {
    headers['content-type'] = 'application/json';
  }

  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    body:
      options.rawBody !== undefined
        ? options.rawBody
        : options.body === undefined
          ? undefined
          : JSON.stringify(options.body),
  });
  const raw = await response.text();
  let payload = null;

  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = raw;
    }
  }

  if (options.expectStatus !== undefined) {
    assert(
      response.status === options.expectStatus,
      `${method} ${path} returned ${response.status}; expected ${options.expectStatus}`,
    );
    return payload;
  }

  if (!response.ok) {
    const detail =
      typeof payload === 'object' && payload
        ? payload.message ?? payload.error ?? response.statusText
        : payload ?? response.statusText;
    throw new Error(`${method} ${path} failed (${response.status}): ${detail}`);
  }

  return payload;
}

async function provisionRuntimeCatalog() {
  let facility = await dataOrThrow(
    admin
      .from('facilities')
      .select('id,name,latitude,longitude')
      .eq('name', 'Runtime Integration Facility')
      .eq('is_active', true)
      .maybeSingle(),
    'Unable to inspect the runtime facility',
  );

  if (!facility) {
    facility = await dataOrThrow(
      admin
        .from('facilities')
        .insert({
          name: 'Runtime Integration Facility',
          address: 'Local integration fixture',
          latitude: 17.4401,
          longitude: 78.3489,
          is_active: true,
        })
        .select('id,name,latitude,longitude')
        .single(),
      'Unable to create the runtime facility',
    );
  }

  let service = await dataOrThrow(
    admin
      .from('services')
      .select('id,name,is_active')
      .eq('name', 'Runtime Garment Care')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle(),
    'Unable to inspect the runtime service',
  );

  if (!service) {
    service = await dataOrThrow(
      admin
        .from('services')
        .insert({
          name: 'Runtime Garment Care',
          description: 'Local integration fixture',
          pricing_unit: 'item',
          is_active: true,
        })
        .select('id,name,is_active')
        .single(),
      'Unable to create the runtime service',
    );
  }

  let activePrice = await dataOrThrow(
    admin
      .from('service_prices')
      .select('service_id,price,services(id,name,is_active)')
      .eq('facility_id', facility.id)
      .eq('service_id', service.id)
      .is('effective_to', null)
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle(),
    'Unable to inspect the runtime service price',
  );

  if (!activePrice) {
    activePrice = await dataOrThrow(
      admin
        .from('service_prices')
        .insert({
          facility_id: facility.id,
          service_id: service.id,
          price: 50,
        })
        .select('service_id,price,services(id,name,is_active)')
        .single(),
      'Unable to create the runtime service price',
    );
  }

  return { facility, activePrice };
}

async function login(phone) {
  let requested = false;

  for (let attempt = 0; attempt < 2 && !requested; attempt += 1) {
    try {
      await api('/auth/phone/request-otp', {
        method: 'POST',
        body: { phone },
      });
      requested = true;
    } catch (error) {
      if (attempt === 0 && String(error.message).includes('(429)')) {
        await delay(6_000);
        continue;
      }
      throw error;
    }
  }

  const verified = await api('/auth/phone/verify-otp', {
    method: 'POST',
    body: { phone, token: '123456' },
  });
  assert(verified?.session?.access_token, `OTP login failed for ${phone}`);
  assert(verified?.user?.id, `Verified user is missing for ${phone}`);

  return {
    id: verified.user.id,
    token: verified.session.access_token,
  };
}

async function dataOrThrow(query, label) {
  const { data, error } = await query;
  if (error) {
    throw new Error(`${label}: ${error.message}`);
  }
  return data;
}

async function expectOrderStatus(orderId, token, expected) {
  const order = await api(`/orders/${orderId}`, { token });
  assert(
    order?.current_status === expected,
    `Order ${orderId} is ${order?.current_status}; expected ${expected}`,
  );
  return order;
}

async function sendRazorpayWebhook(
  event,
  eventId,
  signatureOverride,
  expectStatus,
) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  assert(secret, 'A local Razorpay webhook secret is required for runtime gates');
  const rawBody = JSON.stringify(event);
  const signature =
    signatureOverride ??
    createHmac('sha256', secret).update(rawBody).digest('hex');

  return api('/payments/webhook/razorpay', {
    method: 'POST',
    rawBody,
    headers: {
      'x-razorpay-signature': signature,
      'x-razorpay-event-id': eventId,
    },
    expectStatus,
  });
}

async function provisionOperator(profileId, facilityId) {
  const roleCodes = ['admin', 'manager', 'driver', 'facility_employee'];
  const roles = await dataOrThrow(
    admin.from('roles').select('id,code').in('code', roleCodes),
    'Unable to load operational roles',
  );
  assert(roles.length === roleCodes.length, 'One or more operational roles are missing');

  await dataOrThrow(
    admin.from('profile_roles').upsert(
      roles.map((role) => ({ profile_id: profileId, role_id: role.id })),
      { onConflict: 'profile_id,role_id', ignoreDuplicates: true },
    ),
    'Unable to assign operational roles',
  );

  const employee = await dataOrThrow(
    admin
      .from('facility_employees')
      .select('id,facility_id,is_active')
      .eq('profile_id', profileId)
      .maybeSingle(),
    'Unable to inspect the facility employee',
  );

  if (employee) {
    assert(
      employee.facility_id === facilityId,
      'The operational user belongs to a different facility',
    );
    if (!employee.is_active) {
      await dataOrThrow(
        admin
          .from('facility_employees')
          .update({ is_active: true, employee_role: 'operator' })
          .eq('id', employee.id),
        'Unable to reactivate the facility employee',
      );
    }
  } else {
    await dataOrThrow(
      admin.from('facility_employees').insert({
        facility_id: facilityId,
        profile_id: profileId,
        employee_role: 'operator',
        is_active: true,
      }),
      'Unable to provision the facility employee',
    );
  }

  const driver = await dataOrThrow(
    admin
      .from('drivers')
      .upsert(
        {
          profile_id: profileId,
          is_active: true,
          is_available: true,
          max_concurrent_jobs: 5,
        },
        { onConflict: 'profile_id' },
      )
      .select('id')
      .single(),
    'Unable to provision the driver',
  );

  return driver.id;
}

async function main() {
  await api('/health/ready');

  const customer = await login('+16505550101');
  const operator = await login('+16505550102');

  const { facility, activePrice } = await provisionRuntimeCatalog();
  assert(
    facility.latitude != null && facility.longitude != null,
    'Runtime Integration Facility needs coordinates',
  );
  assert(activePrice?.services?.is_active, 'No active facility-priced service is available');

  const driverId = await provisionOperator(operator.id, facility.id);

  await api('/admin/diagnostics/providers', {
    token: customer.token,
    expectStatus: 403,
  });
  const providerDiagnostics = await api('/admin/diagnostics/providers', {
    token: operator.token,
  });
  assert(
    providerDiagnostics.nodeEnv === 'development' &&
      providerDiagnostics.maps?.mode === 'mock' &&
      providerDiagnostics.maps?.configured === true &&
      providerDiagnostics.payments?.mode === 'mock' &&
      providerDiagnostics.payments?.configured === true,
    'Provider diagnostics did not report the safe mock configuration',
  );
  assert(
    !/key|secret|credential/i.test(JSON.stringify(providerDiagnostics)),
    'Provider diagnostics exposed credential fields',
  );

  await api('/drivers/me/availability', {
    method: 'PATCH',
    token: operator.token,
    body: { isAvailable: true },
  });
  await api('/drivers/me/location', {
    method: 'POST',
    token: operator.token,
    body: {
      latitude: Number(facility.latitude) + 0.008,
      longitude: Number(facility.longitude) + 0.008,
      accuracyM: 5,
    },
  });

  const pickupAddress = await api('/customers/me/addresses', {
    method: 'POST',
    token: customer.token,
    body: {
      label: 'Runtime Gate Pickup',
      addressLine1: 'Runtime Gate Pickup Address',
      city: 'Hyderabad',
      state: 'Telangana',
      postalCode: '500032',
      latitude: Number(facility.latitude) + 0.012,
      longitude: Number(facility.longitude) + 0.012,
      isDefault: false,
    },
  });
  const deliveryAddress = await api('/customers/me/addresses', {
    method: 'POST',
    token: customer.token,
    body: {
      label: 'Runtime Gate Delivery',
      addressLine1: 'Runtime Gate Delivery Address',
      city: 'Hyderabad',
      state: 'Telangana',
      postalCode: '500033',
      latitude: Number(facility.latitude) + 0.018,
      longitude: Number(facility.longitude) - 0.009,
      isDefault: false,
    },
  });

  const orderBody = {
    pickupAddressId: pickupAddress.id,
    deliveryAddressId: deliveryAddress.id,
    facilityId: facility.id,
    paymentMethod: 'razorpay',
    items: [
      {
        serviceId: activePrice.service_id,
        itemName: 'Runtime lifecycle garment',
        quantity: 1,
        weightKg: 1,
        customerNotes: 'Runtime provider and Gates 4-6 verification',
      },
    ],
  };

  const failedOrder = await api('/orders', {
    method: 'POST',
    token: customer.token,
    body: orderBody,
  });
  assert(
    failedOrder.current_status === 'pending_payment',
    'Razorpay test order did not start in pending_payment',
  );
  const failedProviderOrder = await api(
    `/payments/orders/${failedOrder.id}/create`,
    { method: 'POST', token: customer.token },
  );
  assert(failedProviderOrder.provider === 'mock', 'Mock Razorpay was not selected');
  const failedPayment = await api(
    `/payments/mock/${failedProviderOrder.paymentOrderId}/fail`,
    { method: 'POST', token: customer.token },
  );
  assert(failedPayment.status === 'failed', 'Mock payment failure was not recorded');
  await api('/payments/verify', {
    method: 'POST',
    token: customer.token,
    body: {
      razorpayOrderId: failedPayment.razorpayOrderId,
      razorpayPaymentId: failedPayment.razorpayPaymentId,
      razorpaySignature: failedPayment.razorpaySignature,
    },
    expectStatus: 409,
  });
  await expectOrderStatus(failedOrder.id, customer.token, 'pending_payment');

  const order = await api('/orders', {
    method: 'POST',
    token: customer.token,
    body: orderBody,
  });
  const orderId = order.id;
  assert(orderId, 'Order creation did not return an id');
  assert(
    order.current_status === 'pending_payment',
    'New Razorpay order did not await payment',
  );

  const providerOrder = await api(`/payments/orders/${orderId}/create`, {
    method: 'POST',
    token: customer.token,
  });
  assert(providerOrder.provider === 'mock', 'Mock Razorpay was not selected');
  assert(
    providerOrder.amount === Math.round(Number(order.total_amount) * 100),
    'Mock provider order amount is not in matching paise',
  );
  await api(`/payments/mock/${providerOrder.paymentOrderId}/capture`, {
    method: 'POST',
    token: operator.token,
    expectStatus: 403,
  });

  const captures = await Promise.all([
    api(`/payments/mock/${providerOrder.paymentOrderId}/capture`, {
      method: 'POST',
      token: customer.token,
    }),
    api(`/payments/mock/${providerOrder.paymentOrderId}/capture`, {
      method: 'POST',
      token: customer.token,
    }),
  ]);
  const capturedPayment = captures[0];
  assert(
    captures[1].razorpayPaymentId === capturedPayment.razorpayPaymentId,
    'Duplicate mock capture created another payment',
  );

  const verificationBody = {
    razorpayOrderId: capturedPayment.razorpayOrderId,
    razorpayPaymentId: capturedPayment.razorpayPaymentId,
    razorpaySignature: capturedPayment.razorpaySignature,
  };
  await api('/payments/verify', {
    method: 'POST',
    token: operator.token,
    body: verificationBody,
    expectStatus: 403,
  });
  const concurrentVerifications = await Promise.all([
    api('/payments/verify', {
      method: 'POST',
      token: customer.token,
      body: verificationBody,
    }),
    api('/payments/verify', {
      method: 'POST',
      token: customer.token,
      body: verificationBody,
    }),
  ]);
  const verifiedPayment = concurrentVerifications.find(
    (result) => result.duplicate === false,
  );
  assert(
    verifiedPayment?.orderStatus === 'confirmed' &&
      concurrentVerifications.some((result) => result.duplicate === true),
    'Captured mock payment did not confirm the order',
  );
  const replayedVerification = await api('/payments/verify', {
    method: 'POST',
    token: customer.token,
    body: verificationBody,
  });
  assert(replayedVerification.duplicate === true, 'Payment replay was not identified');
  await expectOrderStatus(orderId, customer.token, 'confirmed');

  const paymentWebhook = {
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: capturedPayment.razorpayPaymentId,
          order_id: capturedPayment.razorpayOrderId,
          amount: providerOrder.amount,
          currency: providerOrder.currency,
          status: 'captured',
        },
      },
    },
  };
  const invalidWebhookEventId = `invalid-${randomUUID()}`;
  await sendRazorpayWebhook(
    paymentWebhook,
    invalidWebhookEventId,
    '0'.repeat(64),
    400,
  );
  const invalidWebhookRows = await dataOrThrow(
    admin
      .from('payment_webhook_events')
      .select('id')
      .eq('external_event_id', invalidWebhookEventId),
    'Unable to audit the rejected webhook',
  );
  assert(invalidWebhookRows.length === 0, 'Invalid webhook reached persistence');

  const paymentWebhookEventId = `payment-${randomUUID()}`;
  const webhookDeliveries = await Promise.allSettled([
    sendRazorpayWebhook(paymentWebhook, paymentWebhookEventId),
    sendRazorpayWebhook(paymentWebhook, paymentWebhookEventId),
  ]);
  const acceptedWebhookDeliveries = webhookDeliveries.filter(
    (result) => result.status === 'fulfilled',
  );
  const contendedWebhookDeliveries = webhookDeliveries.filter(
    (result) => result.status === 'rejected',
  );
  assert(
    acceptedWebhookDeliveries.length >= 1 &&
      acceptedWebhookDeliveries.some(
        (result) => result.value.duplicate === false,
      ) &&
      contendedWebhookDeliveries.every(
        (result) =>
          result.reason instanceof Error &&
          result.reason.message.includes('failed (503):'),
      ),
    'Concurrent payment webhook delivery did not honor its processing lease',
  );
  const replayedWebhook = await sendRazorpayWebhook(
    paymentWebhook,
    paymentWebhookEventId,
  );
  assert(replayedWebhook?.duplicate, 'Payment webhook replay was not detected');

  const paymentTransactions = await dataOrThrow(
    admin
      .from('payment_transactions')
      .select('id,transaction_type,status')
      .eq('payment_order_id', providerOrder.paymentOrderId)
      .eq('transaction_type', 'payment'),
    'Unable to audit the payment transaction',
  );
  assert(
    paymentTransactions.length === 1 && paymentTransactions[0].status === 'paid',
    'Payment verification or webhook replay duplicated the ledger',
  );

  const qr = await api(`/qr/orders/${orderId}`, { token: customer.token });
  assert(qr?.payload?.startsWith('BW1:'), 'Order QR payload is missing');

  const pickupAssignment = await api(`/orders/${orderId}/assign-driver`, {
    method: 'POST',
    token: operator.token,
    body: { assignmentType: 'pickup' },
  });
  const pickupAssignmentId = pickupAssignment?.assignment?.id;
  assert(pickupAssignmentId, 'Pickup assignment id is missing');
  await expectOrderStatus(orderId, customer.token, 'pickup_assigned');

  await api(`/driver-assignments/${pickupAssignmentId}/navigation`, {
    method: 'POST',
    token: operator.token,
    expectStatus: 409,
  });

  await api(`/driver-assignments/${pickupAssignmentId}/accept`, {
    method: 'POST',
    token: operator.token,
  });
  await expectOrderStatus(orderId, customer.token, 'pickup_accepted');

  await api(`/driver-assignments/${pickupAssignmentId}/arrive`, {
    method: 'POST',
    token: operator.token,
    expectStatus: 409,
  });

  await api(`/driver-assignments/${pickupAssignmentId}/navigation`, {
    method: 'POST',
    token: operator.token,
  });
  await expectOrderStatus(orderId, customer.token, 'en_route_pickup');

  await api(`/driver-assignments/${pickupAssignmentId}/facility-transit`, {
    method: 'POST',
    token: operator.token,
    expectStatus: 409,
  });

  await api(`/driver-assignments/${pickupAssignmentId}/arrive`, {
    method: 'POST',
    token: operator.token,
  });
  await expectOrderStatus(orderId, customer.token, 'pickup_otp_pending');

  const pickupOtp = await api(`/orders/${orderId}/otp`, {
    method: 'POST',
    token: customer.token,
    body: { otpType: 'pickup' },
  });
  const pickupOtpAttempts = await Promise.allSettled([
    api(`/orders/${orderId}/otp/verify`, {
      method: 'POST',
      token: operator.token,
      body: { otpType: 'pickup', otp: pickupOtp.otp },
    }),
    api(`/orders/${orderId}/otp/verify`, {
      method: 'POST',
      token: operator.token,
      body: { otpType: 'pickup', otp: pickupOtp.otp },
    }),
  ]);
  assert(
    pickupOtpAttempts.filter((result) => result.status === 'fulfilled').length === 1 &&
      pickupOtpAttempts.filter((result) => result.status === 'rejected').length === 1,
    'Concurrent pickup OTP verification was not serialized',
  );
  await expectOrderStatus(orderId, customer.token, 'picked_up');

  const transit = await api(
    `/driver-assignments/${pickupAssignmentId}/facility-transit`,
    { method: 'POST', token: operator.token },
  );
  assert(transit?.route?.distanceMeters > 0, 'Facility route distance is missing');
  assert(transit?.route?.durationSeconds > 0, 'Facility route duration is missing');
  await expectOrderStatus(orderId, customer.token, 'in_transit_to_facility');

  const received = await api('/facility/receive/qr', {
    method: 'POST',
    token: operator.token,
    body: {
      token: qr.payload,
      latitude: Number(facility.latitude),
      longitude: Number(facility.longitude),
    },
  });
  const receiptOperationId = received?.operationId;
  assert(receiptOperationId, 'Facility receipt operation id is missing');
  assert(received.pickupAssignmentStatus === 'completed', 'Pickup assignment was not completed');
  await expectOrderStatus(orderId, customer.token, 'received_at_facility');

  const intakeForVerification = await api(`/facility/orders/${orderId}/intake`, {
    method: 'GET', token: operator.token,
  });
  const verification = await api(`/facility/orders/${orderId}/intake-verify`, {
    method: 'POST',
    token: operator.token,
    body: {items: intakeForVerification.items.map(item => ({
      orderItemId: item.id, countedQuantity: item.quantity,
      weightKg: item.weight_kg == null ? null : Number(item.weight_kg),
    })), notes: 'Runtime Gate 5 verification'},
  });
  assert(verification?.operationId, 'Facility verification operation id is missing');
  await expectOrderStatus(orderId, customer.token, 'verification');

  await api(`/facility/orders/${orderId}/processing`, {
    method: 'POST',
    token: operator.token,
    body: { processType: 'drying' },
    expectStatus: 409,
  });

  const processingStages = ['washing', 'drying', 'ironing', 'folding', 'packaging'];
  const processingOperationIds = [];
  for (const processType of processingStages) {
    let started;
    if (processType === 'washing') {
      const concurrentStarts = await Promise.allSettled([
        api(`/facility/orders/${orderId}/processing`, {
          method: 'POST',
          token: operator.token,
          body: { processType },
        }),
        api(`/facility/orders/${orderId}/processing`, {
          method: 'POST',
          token: operator.token,
          body: { processType },
        }),
      ]);
      const successfulStarts = concurrentStarts.filter(
        (result) => result.status === 'fulfilled',
      );
      const rejectedStarts = concurrentStarts.filter(
        (result) => result.status === 'rejected',
      );
      assert(
        successfulStarts.length === 1 &&
          rejectedStarts.length === 1 &&
          rejectedStarts[0].reason instanceof Error &&
          rejectedStarts[0].reason.message.includes('failed (409):'),
        'Concurrent facility starts were not serialized',
      );
      started = successfulStarts[0].value;
    } else {
      started = await api(`/facility/orders/${orderId}/processing`, {
        method: 'POST',
        token: operator.token,
        body: { processType },
      });
    }
    assert(started.facilityStatus === processType, `${processType} did not start`);
    assert(started.operationStatus !== 'completed', `${processType} returned an invalid status`);
    const stageOperationId = started.operationId ?? started.id;
    assert(stageOperationId, `${processType} operation id is missing`);
    processingOperationIds.push(stageOperationId);
    if (processType === 'washing') {
      await api(`/facility/orders/${orderId}/processing`, {
        method: 'POST',
        token: operator.token,
        body: { processType: 'drying' },
        expectStatus: 409,
      });
    }
    let completed;
    if (processType === 'washing') {
      const concurrentCompletions = await Promise.allSettled([
        api(`/facility/operations/${stageOperationId}/complete`, {
          method: 'POST',
          token: operator.token,
        }),
        api(`/facility/operations/${stageOperationId}/complete`, {
          method: 'POST',
          token: operator.token,
        }),
      ]);
      const successfulCompletions = concurrentCompletions.filter(
        (result) => result.status === 'fulfilled',
      );
      const rejectedCompletions = concurrentCompletions.filter(
        (result) => result.status === 'rejected',
      );
      assert(
        successfulCompletions.length === 1 &&
          rejectedCompletions.length === 1 &&
          rejectedCompletions[0].reason instanceof Error &&
          rejectedCompletions[0].reason.message.includes('failed (409):'),
        'Concurrent facility completions were not serialized',
      );
      completed = successfulCompletions[0].value;
    } else {
      completed = await api(`/facility/operations/${stageOperationId}/complete`, {
        method: 'POST',
        token: operator.token,
      });
    }
    assert(completed.processingCompleted === true, `${processType} did not complete`);
    if (processType === 'washing') {
      await api(`/facility/orders/${orderId}/quality-check`, {
        method: 'POST',
        token: operator.token,
        body: { approved: true },
        expectStatus: 409,
      });
    }
  }
  await expectOrderStatus(orderId, customer.token, 'processing');

  const rejectedQuality = await api(`/facility/orders/${orderId}/quality-check`, {
    method: 'POST',
    token: operator.token,
    body: { approved: false, notes: 'Runtime Gate 5 rework verification' },
  });
  assert(
    rejectedQuality.facilityStatus === 'rework_required',
    'Rejected quality check did not require rework',
  );
  await expectOrderStatus(orderId, customer.token, 'rework_required');
  await api(`/facility/orders/${orderId}/processing`, {
    method: 'POST',
    token: operator.token,
    body: { processType: 'drying' },
    expectStatus: 409,
  });

  for (const processType of processingStages) {
    const started = await api(`/facility/orders/${orderId}/processing`, {
      method: 'POST',
      token: operator.token,
      body: { processType },
    });
    const stageOperationId = started.operationId ?? started.id;
    assert(stageOperationId, `Rework ${processType} operation id is missing`);
    processingOperationIds.push(stageOperationId);
    const completed = await api(
      `/facility/operations/${stageOperationId}/complete`,
      { method: 'POST', token: operator.token },
    );
    assert(
      completed.processingCompleted === true,
      `Rework ${processType} did not complete`,
    );
  }

  const quality = await api(`/facility/orders/${orderId}/quality-check`, {
    method: 'POST',
    token: operator.token,
    body: { approved: true, notes: 'Runtime Gate 5 quality approved after rework' },
  });
  assert(quality.facilityStatus === 'ready_for_delivery', 'Quality check did not approve the order');
  await expectOrderStatus(orderId, customer.token, 'ready_for_delivery');

  const deliveryAssignment = await api(`/orders/${orderId}/assign-delivery`, {
    method: 'POST',
    token: operator.token,
  });
  const deliveryAssignmentId = deliveryAssignment?.assignment?.id;
  assert(deliveryAssignmentId, 'Delivery assignment id is missing');
  await expectOrderStatus(orderId, customer.token, 'delivery_assigned');

  await api(`/driver-assignments/${deliveryAssignmentId}/navigation`, {
    method: 'POST',
    token: operator.token,
    expectStatus: 409,
  });

  await api(`/driver-assignments/${deliveryAssignmentId}/accept`, {
    method: 'POST',
    token: operator.token,
  });
  await expectOrderStatus(orderId, customer.token, 'delivery_accepted');

  await api(`/driver-assignments/${deliveryAssignmentId}/arrive`, {
    method: 'POST',
    token: operator.token,
    expectStatus: 409,
  });

  await api(`/driver-assignments/${deliveryAssignmentId}/navigation`, {
    method: 'POST',
    token: operator.token,
  });
  await expectOrderStatus(orderId, customer.token, 'en_route_delivery');

  await api(`/driver-assignments/${deliveryAssignmentId}/arrive`, {
    method: 'POST',
    token: operator.token,
  });
  await expectOrderStatus(orderId, customer.token, 'delivery_otp_pending');

  const deliveryOtp = await api(`/orders/${orderId}/otp`, {
    method: 'POST',
    token: customer.token,
    body: { otpType: 'delivery' },
  });
  await api(`/orders/${orderId}/otp/verify`, {
    method: 'POST',
    token: customer.token,
    body: { otpType: 'delivery', otp: deliveryOtp.otp },
    expectStatus: 409,
  });
  await expectOrderStatus(orderId, customer.token, 'delivery_otp_pending');

  const upload = await api(`/orders/${orderId}/delivery-proof/upload-url`, {
    method: 'POST',
    token: operator.token,
    body: { fileName: 'runtime-gate-proof.png' },
  });
  assert(upload?.path && upload?.token, 'Signed delivery proof upload data is missing');

  const proofBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6SxkAAAAASUVORK5CYII=',
    'base64',
  );
  const { error: uploadError } = await anonymous.storage
    .from('delivery-proofs')
    .uploadToSignedUrl(upload.path, upload.token, proofBytes, {
      contentType: 'image/png',
    });
  if (uploadError) {
    throw new Error(`Unable to upload delivery proof: ${uploadError.message}`);
  }

  const deliveryCompletionRequest = {
    method: 'POST',
    token: operator.token,
    body: {
      otp: deliveryOtp.otp,
      photoPath: upload.path,
      latitude: Number(facility.latitude) + 0.018,
      longitude: Number(facility.longitude) - 0.009,
    },
  };
  const concurrentDeliveryCompletions = await Promise.allSettled([
    api(`/orders/${orderId}/complete-delivery`, deliveryCompletionRequest),
    api(`/orders/${orderId}/complete-delivery`, deliveryCompletionRequest),
  ]);
  const successfulDeliveryCompletions = concurrentDeliveryCompletions.filter(
    (result) => result.status === 'fulfilled',
  );
  assert(
    successfulDeliveryCompletions.length === 1 &&
      concurrentDeliveryCompletions.filter((result) => result.status === 'rejected').length === 1,
    'Concurrent delivery completion was not serialized',
  );
  const completedDelivery = successfulDeliveryCompletions[0].value;
  assert(
    completedDelivery.orderStatus === 'claim_period_active',
    'Delivery did not enter the claim period',
  );
  assert(completedDelivery.assignmentStatus === 'completed', 'Delivery assignment was not completed');
  await expectOrderStatus(orderId, customer.token, 'claim_period_active');

  await api(`/orders/${orderId}/complete-claim-period`, {
    method: 'POST',
    token: operator.token,
    expectStatus: 400,
  });

  const deliveredAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1_000).toISOString();
  const claimDeadlineAt = new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString();
  await dataOrThrow(
    admin
      .from('orders')
      .update({ delivered_at: deliveredAt, claim_deadline_at: claimDeadlineAt })
      .eq('id', orderId),
    'Unable to advance the local claim-period clock',
  );

  const concurrentClaimCompletions = await Promise.allSettled([
    api(`/orders/${orderId}/complete-claim-period`, {
      method: 'POST',
      token: operator.token,
    }),
    api(`/orders/${orderId}/complete-claim-period`, {
      method: 'POST',
      token: operator.token,
    }),
  ]);
  assert(
    concurrentClaimCompletions.filter((result) => result.status === 'fulfilled').length === 1 &&
      concurrentClaimCompletions.filter((result) => result.status === 'rejected').length === 1,
    'Concurrent claim expiry completion was not serialized',
  );
  await expectOrderStatus(orderId, customer.token, 'completed');

  await api(`/payments/refunds/${providerOrder.paymentOrderId}/request`, {
    method: 'POST',
    token: operator.token,
    body: { amount: 10, reason: 'Unauthorized runtime refund' },
    expectStatus: 403,
  });
  const refundRequest = await api(
    `/payments/refunds/${providerOrder.paymentOrderId}/request`,
    {
      method: 'POST',
      token: customer.token,
      body: { amount: 10, reason: 'Runtime provider refund verification' },
    },
  );
  await api(`/payments/refunds/${refundRequest.id}/approve`, {
    method: 'POST',
    token: customer.token,
    expectStatus: 403,
  });

  const concurrentRefundApprovals = await Promise.allSettled([
    api(`/payments/refunds/${refundRequest.id}/approve`, {
      method: 'POST',
      token: operator.token,
    }),
    api(`/payments/refunds/${refundRequest.id}/approve`, {
      method: 'POST',
      token: operator.token,
    }),
  ]);
  const successfulRefundApprovals = concurrentRefundApprovals.filter(
    (result) => result.status === 'fulfilled',
  );
  assert(
    successfulRefundApprovals.length >= 1 &&
      successfulRefundApprovals.every(
        (result) =>
          result.value.providerRefundId ===
          successfulRefundApprovals[0].value.providerRefundId,
      ),
    'Concurrent refund approval returned conflicting provider refunds',
  );
  const approvedRefund = successfulRefundApprovals[0].value;
  assert(
    approvedRefund.providerRefundId?.startsWith('mock_refund_') &&
      approvedRefund.status === 'completed',
    'Mock refund did not complete',
  );
  const replayedRefundApproval = await api(
    `/payments/refunds/${refundRequest.id}/approve`,
    { method: 'POST', token: operator.token },
  );
  assert(replayedRefundApproval.duplicate, 'Refund replay was not identified');

  const refundWebhook = {
    event: 'refund.processed',
    payload: {
      refund: {
        entity: {
          id: approvedRefund.providerRefundId,
          payment_id: capturedPayment.razorpayPaymentId,
          amount: 1_000,
          currency: 'INR',
          status: 'processed',
        },
      },
    },
  };
  const refundWebhookEventId = `refund-${randomUUID()}`;
  const firstRefundWebhook = await sendRazorpayWebhook(
    refundWebhook,
    refundWebhookEventId,
  );
  const replayedRefundWebhook = await sendRazorpayWebhook(
    refundWebhook,
    refundWebhookEventId,
  );
  assert(!firstRefundWebhook.duplicate, 'First refund webhook was treated as a replay');
  assert(replayedRefundWebhook.duplicate, 'Refund webhook replay was not detected');

  const refundTransactions = await dataOrThrow(
    admin
      .from('payment_transactions')
      .select('id,provider_reference')
      .eq('payment_order_id', providerOrder.paymentOrderId)
      .eq('transaction_type', 'refund'),
    'Unable to audit the refund transaction',
  );
  const refundAudit = await dataOrThrow(
    admin
      .from('financial_audit_logs')
      .select('id')
      .eq('entity_type', 'refund_request')
      .eq('entity_id', refundRequest.id)
      .eq('action', 'refund_approved'),
    'Unable to audit the refund approval',
  );
  assert(
    refundTransactions.length === 1 && refundAudit.length === 1,
    'Refund replay duplicated a ledger or audit record',
  );

  const history = await api(`/orders/${orderId}/status-history`, {
    token: customer.token,
  });
  const expectedStatuses = [
    'pending_payment',
    'confirmed',
    'pickup_assigned',
    'pickup_accepted',
    'en_route_pickup',
    'pickup_otp_pending',
    'picked_up',
    'in_transit_to_facility',
    'received_at_facility',
    'verification',
    'processing',
    'quality_check',
    'rework_required',
    'processing',
    'quality_check',
    'ready_for_delivery',
    'delivery_assigned',
    'delivery_accepted',
    'en_route_delivery',
    'delivery_otp_pending',
    'delivered',
    'claim_period_active',
    'completed',
  ];
  const actualStatuses = history.map((entry) => entry.to_status);
  assert(
    JSON.stringify(actualStatuses) === JSON.stringify(expectedStatuses),
    `Unexpected lifecycle history: ${actualStatuses.join(' -> ')}`,
  );

  const assignments = await dataOrThrow(
    admin
      .from('driver_assignments')
      .select('assignment_type,status,driver_id')
      .eq('order_id', orderId)
      .order('assigned_at'),
    'Unable to validate driver assignments',
  );
  assert(assignments.length === 2, 'Expected pickup and delivery assignments');
  assert(
    assignments.every((assignment) => assignment.status === 'completed'),
    'One or more driver assignments are incomplete',
  );
  assert(
    assignments.every((assignment) => assignment.driver_id === driverId),
    'An unexpected driver handled the runtime order',
  );

  const facilityOperations = await dataOrThrow(
    admin
      .from('facility_order_operations')
      .select('id,operation_type,current_status,ready_for_delivery_at,started_at,completed_at')
      .eq('order_id', orderId)
      .order('started_at', { ascending: true })
      .order('id', { ascending: true }),
    'Unable to validate facility operations',
  );
  const expectedOperationTypes = [
    'facility_workflow',
    'verification',
    'washing',
    'drying',
    'ironing',
    'folding',
    'packaging',
    'quality_check',
    'washing',
    'drying',
    'ironing',
    'folding',
    'packaging',
    'quality_check',
  ];
  assert(
    JSON.stringify(facilityOperations.map((operation) => operation.operation_type)) ===
      JSON.stringify(expectedOperationTypes),
    'Facility stage ledger does not contain the complete ordered workflow',
  );
  assert(
    processingOperationIds.every((operationId) =>
      facilityOperations.some(
        (operation) => operation.id === operationId && operation.completed_at,
      ),
    ),
    'One or more facility processing stages lack completion evidence',
  );
  const finalFacilityOperation = facilityOperations.at(-1);
  assert(
    finalFacilityOperation.current_status === 'ready_for_delivery' &&
      finalFacilityOperation.ready_for_delivery_at &&
      finalFacilityOperation.completed_at,
    'Facility quality operation did not finish correctly',
  );

  const proofs = await dataOrThrow(
    admin.from('delivery_proofs').select('id,photo_path').eq('order_id', orderId),
    'Unable to validate the delivery proof',
  );
  assert(proofs.length === 1 && proofs[0].photo_path === upload.path, 'Delivery proof was not recorded');

  const scanLogs = await dataOrThrow(
    admin
      .from('qr_scan_logs')
      .select('scan_action,order_qr_codes!inner(order_id)')
      .eq('order_qr_codes.order_id', orderId)
      .eq('scan_action', 'facility_received'),
    'Unable to validate the facility QR scan',
  );
  assert(scanLogs.length === 1, 'Facility QR receipt was not recorded exactly once');

  console.log(
    [
      'PASS Runtime Gate 4 — Pickup',
      '  confirmed → pickup_assigned → pickup_accepted → en_route_pickup → pickup_otp_pending → picked_up → in_transit_to_facility',
      'PASS Runtime Gate 5 — Facility',
      '  receive QR → processing → rejected QC → ordered rework → approved QC → ready_for_delivery',
      'PASS Runtime Gate 6 — Delivery',
      '  assignment → accepted → navigation → arrival → OTP + photo → delivered → claim_period_active → completed',
      'PASS Mock Razorpay — failed payment, capture, verification, replay, webhook, and refund controls',
      `Fixture order: ${orderId}`,
      'Maps mode: MockMapsProvider (zero Google HTTP calls)',
    ].join('\n'),
  );
}

main().catch((error) => {
  console.error(`FAIL Runtime Gates 4-6: ${error.message}`);
  process.exitCode = 1;
});
