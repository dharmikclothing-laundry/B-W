import { MockPaymentProvider } from './mock-payment.provider';

describe('MockPaymentProvider', () => {
  let provider: MockPaymentProvider;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    provider = new MockPaymentProvider();
    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('network access is forbidden'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates unique provider orders in paise without HTTP', async () => {
    const input = {
      amount: 5_000,
      currency: 'INR',
      receipt: 'BW-unit-test',
    };

    const first = await provider.createOrder(input);
    const second = await provider.createOrder(input);

    expect(first).toMatchObject({ amount: 5_000, currency: 'INR' });
    expect(first.id).toMatch(/^mock_order_[0-9a-f-]{36}$/);
    expect(second.id).not.toBe(first.id);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each(['captured', 'failed'] as const)(
    'simulates and fetches a %s payment with a verifiable signature',
    async (status) => {
      const order = await provider.createOrder({
        amount: 5_000,
        currency: 'INR',
        receipt: 'BW-unit-test',
      });
      const result = await provider.simulatePayment({
        providerOrderId: order.id,
        amount: order.amount,
        currency: order.currency,
        status,
      });

      expect(result.payment.id).toMatch(/^mock_payment_[0-9a-f-]{36}$/);
      expect(await provider.fetchPayment(result.payment.id)).toEqual(
        result.payment,
      );
      expect(
        provider.verifyCheckoutSignature({
          providerOrderId: order.id,
          providerPaymentId: result.payment.id,
          signature: result.signature,
        }),
      ).toBe(true);
      expect(
        provider.verifyCheckoutSignature({
          providerOrderId: order.id,
          providerPaymentId: result.payment.id,
          signature: '0'.repeat(64),
        }),
      ).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it('replays payment simulation and refunds by their stable references', async () => {
    const order = await provider.createOrder({
      amount: 5_000,
      currency: 'INR',
      receipt: 'BW-unit-test',
    });
    const simulationInput = {
      providerOrderId: order.id,
      amount: order.amount,
      currency: order.currency,
      status: 'captured' as const,
    };

    const firstPayment = await provider.simulatePayment(simulationInput);
    const replayedPayment = await provider.simulatePayment(simulationInput);
    expect(replayedPayment).toEqual(firstPayment);

    const refundInput = {
      providerPaymentId: firstPayment.payment.id,
      amount: 1_000,
      currency: 'INR',
      reference: 'refund-request-1',
    };
    const firstRefund = await provider.refundPayment(refundInput);
    const replayedRefund = await provider.refundPayment(refundInput);
    const otherRefund = await provider.refundPayment({
      ...refundInput,
      reference: 'refund-request-2',
    });

    expect(firstRefund.id).toMatch(/^mock_refund_[0-9a-f-]{36}$/);
    expect(firstRefund).toMatchObject({
      paymentId: firstPayment.payment.id,
      amount: 1_000,
      currency: 'INR',
      status: 'processed',
      reference: 'refund-request-1',
    });
    expect(replayedRefund).toEqual(firstRefund);
    expect(otherRefund.id).not.toBe(firstRefund.id);
    await expect(provider.fetchRefund(firstRefund.id)).resolves.toEqual(
      firstRefund,
    );
    await expect(
      provider.findRefundByReference({
        providerPaymentId: firstPayment.payment.id,
        reference: refundInput.reference,
      }),
    ).resolves.toEqual(firstRefund);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects conflicting simulated provider state', async () => {
    const order = await provider.createOrder({
      amount: 5_000,
      currency: 'INR',
      receipt: 'BW-unit-test',
    });
    await provider.simulatePayment({
      providerOrderId: order.id,
      amount: order.amount,
      currency: order.currency,
      status: 'failed',
    });

    await expect(
      provider.simulatePayment({
        providerOrderId: order.id,
        amount: order.amount,
        currency: order.currency,
        status: 'captured',
      }),
    ).rejects.toThrow('already has another state');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
