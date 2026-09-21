import {apiRequest} from './api';

export type CreatePaymentOrderResponse = {
  paymentOrderId: string;
  razorpayOrderId?: string;
  amount?: number;
  currency?: string;
  keyId?: string;
  provider?: string;

  [key: string]: unknown;
};

export type MockCaptureResponse = {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;

  [key: string]: unknown;
};

export type VerifyPaymentResponse = {
  verified: boolean;
  orderStatus?: string;
  provider?: string;

  [key: string]: unknown;
};

export type PaymentSummary = {
  orderId: string;
  payment: {
    paymentOrderId: string;
    status: string;
    amount: number; // Backend supplies paise.
    currency: string;
  } | null;
  refunds: Array<{
    refundRequestId: string;
    amount: number; // Backend supplies rupees.
    reason: string;
    status: string;
    cancellation: boolean;
  }>;
};

export async function getPaymentSummary(accessToken: string, orderId: string) {
  return apiRequest<PaymentSummary>(`/payments/orders/${orderId}`, {accessToken});
}

export async function requestRefund(
  accessToken: string,
  paymentOrderId: string,
  amount: number,
  reason: string,
) {
  const trimmed = reason.trim();
  if (!Number.isFinite(amount) || amount < 0.01 || trimmed.length < 3 || trimmed.length > 500) {
    throw new Error('Enter a valid refund amount and reason.');
  }
  return apiRequest(`/payments/refunds/${paymentOrderId}/request`, {
    method: 'POST', accessToken, body: {amount, reason: trimmed},
  });
}

export async function createPaymentOrder(
  accessToken: string,
  orderId: string,
): Promise<CreatePaymentOrderResponse> {
  const response =
    await apiRequest<CreatePaymentOrderResponse>(
      `/payments/orders/${orderId}/create`,
      {
        method: 'POST',
        accessToken,
      },
    );

  if (
    !response.paymentOrderId
  ) {
    throw new Error(
      'Payment order ID was not returned.',
    );
  }

  return response;
}

export async function captureMockPayment(
  accessToken: string,
  paymentOrderId: string,
): Promise<MockCaptureResponse> {
  const response =
    await apiRequest<MockCaptureResponse>(
      `/payments/mock/${paymentOrderId}/capture`,
      {
        method: 'POST',
        accessToken,
      },
    );

  if (
    !response.razorpayOrderId ||
    !response.razorpayPaymentId ||
    !response.razorpaySignature
  ) {
    throw new Error(
      'Mock payment response is incomplete.',
    );
  }

  return response;
}

export async function verifyPayment(
  accessToken: string,
  input: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  },
): Promise<VerifyPaymentResponse> {
  const response =
    await apiRequest<VerifyPaymentResponse>(
      '/payments/verify',
      {
        method: 'POST',
        accessToken,
        body: input,
      },
    );

  if (
    response.verified !== true
  ) {
    throw new Error(
      'Payment was not verified.',
    );
  }

  return response;
}

export async function completeMockPayment(
  accessToken: string,
  orderId: string,
): Promise<VerifyPaymentResponse> {
  const paymentOrder =
    await createPaymentOrder(
      accessToken,
      orderId,
    );

  const capture =
    await captureMockPayment(
      accessToken,
      paymentOrder.paymentOrderId,
    );

  return verifyPayment(
    accessToken,
    {
      razorpayOrderId:
        capture.razorpayOrderId,

      razorpayPaymentId:
        capture.razorpayPaymentId,

      razorpaySignature:
        capture.razorpaySignature,
    },
  );
}

export async function completeExistingMockPayment(
  accessToken: string,
  paymentOrderId: string,
): Promise<VerifyPaymentResponse> {
  const capture =
    await captureMockPayment(
      accessToken,
      paymentOrderId,
    );

  return verifyPayment(
    accessToken,
    {
      razorpayOrderId:
        capture.razorpayOrderId,

      razorpayPaymentId:
        capture.razorpayPaymentId,

      razorpaySignature:
        capture.razorpaySignature,
    },
  );
}
