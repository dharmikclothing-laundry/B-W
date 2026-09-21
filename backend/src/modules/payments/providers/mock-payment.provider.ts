import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'crypto';
import {
  DevelopmentPaymentProvider,
  MockPaymentSimulation,
  ProviderPayment,
  ProviderPaymentOrder,
  ProviderRefund,
} from './payment.provider';

@Injectable()
export class MockPaymentProvider implements DevelopmentPaymentProvider {
  readonly mode = 'mock' as const;
  readonly publicKeyId = 'mock_key_development';
  private readonly signingSecret = randomBytes(32);
  private readonly orders = new Map<string, ProviderPaymentOrder>();
  private readonly payments = new Map<string, ProviderPayment>();
  private readonly refundsByReference = new Map<string, ProviderRefund>();
  private readonly refundsById = new Map<string, ProviderRefund>();

  async createOrder(input: {
    amount: number;
    currency: string;
    receipt: string;
  }): Promise<ProviderPaymentOrder> {
    const order = {
      id: `mock_order_${randomUUID()}`,
      amount: input.amount,
      currency: input.currency,
    };
    this.orders.set(order.id, order);
    return order;
  }

  private signature(providerOrderId: string, providerPaymentId: string) {
    return createHmac('sha256', this.signingSecret)
      .update(`${providerOrderId}|${providerPaymentId}`)
      .digest('hex');
  }

  verifyCheckoutSignature(input: {
    providerOrderId: string;
    providerPaymentId: string;
    signature: string;
  }) {
    if (
      typeof input.signature !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(input.signature)
    ) {
      return false;
    }

    const payment = this.payments.get(input.providerPaymentId);
    if (!payment || payment.orderId !== input.providerOrderId) {
      return false;
    }

    const expected = Buffer.from(
      this.signature(input.providerOrderId, input.providerPaymentId),
      'hex',
    );
    const actual = Buffer.from(input.signature, 'hex');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  async simulatePayment(input: {
    providerOrderId: string;
    amount: number;
    currency: string;
    status: 'captured' | 'failed';
  }): Promise<MockPaymentSimulation> {
    const knownOrder = this.orders.get(input.providerOrderId);
    if (
      knownOrder &&
      (knownOrder.amount !== input.amount ||
        knownOrder.currency !== input.currency)
    ) {
      throw new ConflictException('Mock provider order details do not match');
    }

    if (!knownOrder) {
      if (!input.providerOrderId.startsWith('mock_order_')) {
        throw new NotFoundException('Mock provider order not found');
      }
      this.orders.set(input.providerOrderId, {
        id: input.providerOrderId,
        amount: input.amount,
        currency: input.currency,
      });
    }

    const existing = [...this.payments.values()].find(
      (payment) => payment.orderId === input.providerOrderId,
    );
    if (existing) {
      if (existing.status !== input.status) {
        throw new ConflictException(
          'Mock provider payment already has another state',
        );
      }
      return {
        payment: existing,
        signature: this.signature(input.providerOrderId, existing.id),
      };
    }

    const payment: ProviderPayment = {
      id: `mock_payment_${randomUUID()}`,
      orderId: input.providerOrderId,
      amount: input.amount,
      currency: input.currency,
      status: input.status,
    };
    this.payments.set(payment.id, payment);
    return {
      payment,
      signature: this.signature(input.providerOrderId, payment.id),
    };
  }

  async fetchPayment(providerPaymentId: string): Promise<ProviderPayment> {
    const payment = this.payments.get(providerPaymentId);
    if (!payment) {
      throw new NotFoundException('Mock provider payment not found');
    }
    return payment;
  }

  async refundPayment(input: {
    providerPaymentId: string;
    amount: number;
    currency: string;
    reference: string;
  }): Promise<ProviderRefund> {
    if (
      !input.providerPaymentId.startsWith('mock_payment_') ||
      !Number.isSafeInteger(input.amount) ||
      input.amount <= 0 ||
      !input.currency
    ) {
      throw new BadRequestException('Invalid mock refund request');
    }

    const existing = this.refundsByReference.get(input.reference);
    if (existing) {
      if (
        existing.paymentId !== input.providerPaymentId ||
        existing.amount !== input.amount ||
        existing.currency !== input.currency
      ) {
        throw new ConflictException(
          'Mock refund reference already has different details',
        );
      }
      return existing;
    }

    const refund: ProviderRefund = {
      id: `mock_refund_${randomUUID()}`,
      paymentId: input.providerPaymentId,
      amount: input.amount,
      currency: input.currency,
      status: 'processed',
      reference: input.reference,
    };
    this.refundsByReference.set(input.reference, refund);
    this.refundsById.set(refund.id, refund);
    return refund;
  }

  async fetchRefund(providerRefundId: string): Promise<ProviderRefund> {
    const refund = this.refundsById.get(providerRefundId);
    if (!refund) {
      throw new NotFoundException('Mock provider refund not found');
    }
    return refund;
  }

  async findRefundByReference(input: {
    providerPaymentId: string;
    reference: string;
  }): Promise<ProviderRefund | null> {
    const refund = this.refundsByReference.get(input.reference) ?? null;
    return refund?.paymentId === input.providerPaymentId ? refund : null;
  }
}
