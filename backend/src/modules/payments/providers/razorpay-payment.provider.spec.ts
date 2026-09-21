import { createHmac } from 'crypto';

import { RazorpayPaymentProvider } from './razorpay-payment.provider';

describe('RazorpayPaymentProvider', () => {
  let provider: RazorpayPaymentProvider;

  beforeEach(() => {
    provider = new RazorpayPaymentProvider('rzp_test_unit', 'unit-secret');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('requires live API credentials', () => {
    expect(() => new RazorpayPaymentProvider('', '')).toThrow(
      'Razorpay is not configured',
    );
  });

  it('verifies checkout signatures locally', () => {
    const signature = createHmac('sha256', 'unit-secret')
      .update('order_1|pay_1')
      .digest('hex');

    expect(
      provider.verifyCheckoutSignature({
        providerOrderId: 'order_1',
        providerPaymentId: 'pay_1',
        signature,
      }),
    ).toBe(true);
    expect(
      provider.verifyCheckoutSignature({
        providerOrderId: 'order_1',
        providerPaymentId: 'pay_1',
        signature: '0'.repeat(64),
      }),
    ).toBe(false);
  });

  it('normalizes mocked live order and payment responses', async () => {
    const client = (provider as any).client;
    client.orders.create = jest.fn().mockResolvedValue({
      id: 'order_live1',
      amount: 5_000,
      currency: 'INR',
    });
    client.payments.fetch = jest.fn().mockResolvedValue({
      id: 'pay_live1',
      order_id: 'order_live1',
      amount: 5_000,
      currency: 'INR',
      status: 'captured',
    });

    await expect(
      provider.createOrder({
        amount: 5_000,
        currency: 'INR',
        receipt: 'BW-unit-test',
      }),
    ).resolves.toEqual({
      id: 'order_live1',
      amount: 5_000,
      currency: 'INR',
    });
    await expect(provider.fetchPayment('pay_live1')).resolves.toEqual({
      id: 'pay_live1',
      orderId: 'order_live1',
      amount: 5_000,
      currency: 'INR',
      status: 'captured',
    });
  });

  it('passes paise to a mocked live refund and normalizes the result', async () => {
    const refund = jest.fn().mockResolvedValue({
      id: 'rfnd_live1',
      payment_id: 'pay_live1',
      amount: 1_500,
      currency: 'INR',
      status: 'processed',
      notes: {
        bright_white_refund_id:
          '00000000-0000-4000-8000-000000000001',
      },
    });
    (provider as any).client.payments.refund = refund;

    await expect(
      provider.refundPayment({
        providerPaymentId: 'pay_live1',
        amount: 1_500,
        currency: 'INR',
        reference: '00000000-0000-4000-8000-000000000001',
      }),
    ).resolves.toEqual({
      id: 'rfnd_live1',
      paymentId: 'pay_live1',
      amount: 1_500,
      currency: 'INR',
      status: 'processed',
      reference: '00000000-0000-4000-8000-000000000001',
    });
    expect(refund).toHaveBeenCalledWith(
      'pay_live1',
      expect.objectContaining({ amount: 1_500 }),
    );
  });

  it('fetches and reconciles live refunds without issuing another refund', async () => {
    const reference = '00000000-0000-4000-8000-000000000001';
    const matching = {
      id: 'rfnd_live1',
      payment_id: 'pay_live1',
      amount: 1_500,
      currency: 'INR',
      status: 'processed',
      notes: { bright_white_refund_id: reference },
    };
    const client = (provider as any).client;
    client.refunds.fetch = jest.fn().mockResolvedValue(matching);
    client.payments.fetchMultipleRefund = jest.fn().mockResolvedValue({
      items: [
        {
          ...matching,
          id: 'rfnd_other',
          notes: { bright_white_refund_id: 'another-reference' },
        },
        matching,
      ],
    });

    const normalized = {
      id: 'rfnd_live1',
      paymentId: 'pay_live1',
      amount: 1_500,
      currency: 'INR',
      status: 'processed',
      reference,
    };
    await expect(provider.fetchRefund('rfnd_live1')).resolves.toEqual(
      normalized,
    );
    await expect(
      provider.findRefundByReference({
        providerPaymentId: 'pay_live1',
        reference,
      }),
    ).resolves.toEqual(normalized);
    expect(client.payments.refund).toBeDefined();
  });

  it.each(['createOrder', 'fetchPayment', 'refundPayment'] as const)(
    'maps %s provider failures to a controlled gateway error',
    async (operation) => {
      const client = (provider as any).client;
      client.orders.create = jest.fn().mockRejectedValue(new Error('secret'));
      client.payments.fetch = jest.fn().mockRejectedValue(new Error('secret'));
      client.payments.refund = jest.fn().mockRejectedValue(new Error('secret'));

      const call = {
        createOrder: () =>
          provider.createOrder({
            amount: 5_000,
            currency: 'INR',
            receipt: 'BW-unit-test',
          }),
        fetchPayment: () => provider.fetchPayment('pay_live1'),
        refundPayment: () =>
          provider.refundPayment({
            providerPaymentId: 'pay_live1',
            amount: 1_000,
            currency: 'INR',
            reference: 'refund-1',
          }),
      }[operation];

      await expect(call()).rejects.toMatchObject({ status: 502 });
    },
  );
});
