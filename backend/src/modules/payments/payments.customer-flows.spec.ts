import { ConflictException } from '@nestjs/common';

import { PaymentsService } from './payments.service';
import { PaymentProvider } from './providers/payment.provider';

function providerMock(): jest.Mocked<PaymentProvider> {
  return {
    mode: 'live',
    publicKeyId: 'rzp_test_public',
    createOrder: jest.fn(),
    verifyCheckoutSignature: jest.fn(),
    fetchPayment: jest.fn(),
    refundPayment: jest.fn(),
    fetchRefund: jest.fn(),
    findRefundByReference: jest.fn(),
  };
}

function fluentResult(data: unknown, error: unknown = null) {
  const result = { data, error };
  const query: any = {};
  for (const method of ['select', 'eq', 'order', 'limit']) {
    query[method] = jest.fn(() => query);
  }
  query.maybeSingle = jest.fn().mockResolvedValue(result);
  query.then = (
    resolve: (value: typeof result) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return query;
}

describe('PaymentsService customer refund requests', () => {
  it('uses the atomic RPC with a normalized two-decimal amount', async () => {
    const refund = {
      id: 'refund-1',
      amount: 12.35,
      status: 'requested',
    };
    const rpc = jest.fn().mockResolvedValue({ data: refund, error: null });
    const service = new PaymentsService(
      { admin: { rpc } } as any,
      providerMock(),
    );

    await expect(
      service.requestRefund(
        'profile-1',
        'payment-1',
        12.345,
        'Service was cancelled',
      ),
    ).resolves.toEqual(refund);
    expect(rpc).toHaveBeenCalledWith('request_refund_atomic', {
      p_payment_order_id: 'payment-1',
      p_requested_by: 'profile-1',
      p_amount: 12.35,
      p_reason: 'Service was cancelled',
    });
  });

  it('maps a concurrent over-refund rejection to conflict', async () => {
    const service = new PaymentsService(
      {
        admin: {
          rpc: jest.fn().mockResolvedValue({
            data: null,
            error: {
              code: '23514',
              message: 'Refund exceeds the remaining captured amount',
            },
          }),
        },
      } as any,
      providerMock(),
    );

    await expect(
      service.requestRefund(
        'profile-1',
        'payment-1',
        50,
        'Service was cancelled',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('PaymentsService owned payment recovery', () => {
  it('exposes refund eligibility only for a captured payment in an eligible lifecycle', async () => {
    const payment = {id: 'payment-1', order_id: 'order-1', provider: 'razorpay', provider_order_id: 'provider-1',
      amount: '100.00', currency: 'INR', status: 'paid', paid_at: '2026-09-21T00:00:00.000Z',
      created_at: '2026-09-21T00:00:00.000Z', updated_at: '2026-09-21T00:00:00.000Z'};
    const from = jest.fn((table: string) => table === 'payment_orders' ? fluentResult(payment) : fluentResult([]));
    const service = new PaymentsService({admin: {from}} as any, providerMock());
    jest.spyOn(service as any, 'requireOwnedOrder').mockResolvedValue({id: 'order-1', current_status: 'claim_period_active'});
    const result = await service.getOrderPaymentSummary('profile-1', 'order-1');
    expect(result.refundEligibility).toEqual({eligible: true, remainingAmount: 100});
  });

  it('returns resumable provider data and safe refund status fields', async () => {
    const payment = {
      id: 'payment-1',
      order_id: 'order-1',
      provider: 'razorpay',
      provider_order_id: 'order_provider1',
      amount: '50.00',
      currency: 'INR',
      status: 'created',
      paid_at: null,
      created_at: '2026-09-15T00:00:00.000Z',
      updated_at: '2026-09-15T00:00:00.000Z',
    };
    const refunds = [
      {
        id: 'refund-1',
        amount: '50.00',
        reason: 'Pickup is no longer needed',
        status: 'requested',
        is_cancellation_refund: true,
        approved_at: null,
        processed_at: null,
        created_at: '2026-09-15T00:01:00.000Z',
      },
    ];
    const paymentQuery = fluentResult(payment);
    const refundsQuery = fluentResult(refunds);
    const from = jest.fn((table: string) => {
      if (table === 'payment_orders') return paymentQuery;
      if (table === 'refund_requests') return refundsQuery;
      throw new Error(`Unexpected table ${table}`);
    });
    const service = new PaymentsService(
      { admin: { from } } as any,
      providerMock(),
    );
    const ownership = jest
      .spyOn(service as any, 'requireOwnedOrder')
      .mockResolvedValue({ id: 'order-1' });

    await expect(
      service.getOrderPaymentSummary('profile-1', 'order-1'),
    ).resolves.toEqual({
      orderId: 'order-1',
      payment: {
        paymentOrderId: 'payment-1',
        provider: 'razorpay',
        providerOrderId: 'order_provider1',
        razorpayOrderId: 'order_provider1',
        amount: 5000,
        currency: 'INR',
        status: 'created',
        paidAt: null,
        createdAt: '2026-09-15T00:00:00.000Z',
        updatedAt: '2026-09-15T00:00:00.000Z',
        canResume: true,
        keyId: 'rzp_test_public',
      },
      refunds: [
        {
          refundRequestId: 'refund-1',
          amount: 50,
          reason: 'Pickup is no longer needed',
          status: 'requested',
          cancellation: true,
          approvedAt: null,
          processedAt: null,
          createdAt: '2026-09-15T00:01:00.000Z',
        },
      ],
      refundEligibility: {eligible: false, remainingAmount: 0},
    });
    expect(ownership).toHaveBeenCalledWith('profile-1', 'order-1');
  });

  it('returns an empty summary for an owned COD order', async () => {
    const service = new PaymentsService(
      {
        admin: {
          from: jest.fn(() => fluentResult(null)),
        },
      } as any,
      providerMock(),
    );
    jest
      .spyOn(service as any, 'requireOwnedOrder')
      .mockResolvedValue({ id: 'order-1' });

    await expect(
      service.getOrderPaymentSummary('profile-1', 'order-1'),
    ).resolves.toEqual({
      orderId: 'order-1',
      payment: null,
      refunds: [],
      refundEligibility: {eligible: false, remainingAmount: 0},
    });
  });
});
