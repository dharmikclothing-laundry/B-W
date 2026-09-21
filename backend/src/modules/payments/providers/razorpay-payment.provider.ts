import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import Razorpay from 'razorpay';
import {
  PaymentProvider,
  ProviderPayment,
  ProviderPaymentOrder,
  ProviderRefund,
} from './payment.provider';

@Injectable()
export class RazorpayPaymentProvider implements PaymentProvider {
  readonly mode = 'live' as const;
  readonly publicKeyId: string;
  private readonly client: Razorpay;

  constructor(keyId: string, private readonly keySecret: string) {
    if (!keyId || !keySecret) {
      throw new ServiceUnavailableException('Razorpay is not configured');
    }
    this.publicKeyId = keyId;
    this.client = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }

  private normalizeRefund(result: any): ProviderRefund {
    const reference = result.notes?.bright_white_refund_id;
    return {
      id: result.id,
      paymentId: result.payment_id,
      amount: Number(result.amount),
      currency: result.currency,
      status: result.status,
      reference: typeof reference === 'string' ? reference : null,
    };
  }

  async createOrder(input: {
    amount: number;
    currency: string;
    receipt: string;
  }): Promise<ProviderPaymentOrder> {
    try {
      const result: any = await this.client.orders.create(input);
      return {
        id: result.id,
        amount: Number(result.amount),
        currency: result.currency,
      };
    } catch {
      throw new BadGatewayException('Razorpay order creation failed');
    }
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
    const expected = Buffer.from(
      createHmac('sha256', this.keySecret)
        .update(`${input.providerOrderId}|${input.providerPaymentId}`)
        .digest('hex'),
      'hex',
    );
    const actual = Buffer.from(input.signature, 'hex');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  async fetchPayment(providerPaymentId: string): Promise<ProviderPayment> {
    try {
      const result: any = await this.client.payments.fetch(providerPaymentId);
      return {
        id: result.id,
        orderId: result.order_id,
        amount: Number(result.amount),
        currency: result.currency,
        status: result.status,
      };
    } catch {
      throw new BadGatewayException('Razorpay payment verification failed');
    }
  }

  async refundPayment(input: {
    providerPaymentId: string;
    amount: number;
    currency: string;
    reference: string;
  }): Promise<ProviderRefund> {
    try {
      const result: any = await this.client.payments.refund(
        input.providerPaymentId,
        {
          amount: input.amount,
          receipt: `BW-RF-${input.reference.slice(0, 24)}`,
          notes: {
            bright_white_refund_id: input.reference,
          },
        },
      );
      return this.normalizeRefund(result);
    } catch {
      throw new BadGatewayException('Razorpay refund failed');
    }
  }

  async fetchRefund(providerRefundId: string): Promise<ProviderRefund> {
    try {
      const result: any = await this.client.refunds.fetch(providerRefundId);
      return this.normalizeRefund(result);
    } catch {
      throw new BadGatewayException('Razorpay refund lookup failed');
    }
  }

  async findRefundByReference(input: {
    providerPaymentId: string;
    reference: string;
  }): Promise<ProviderRefund | null> {
    try {
      const result: any = await this.client.payments.fetchMultipleRefund(
        input.providerPaymentId,
        { count: 100 },
      );
      const match = result.items?.find(
        (refund: any) =>
          refund.notes?.bright_white_refund_id === input.reference,
      );
      return match ? this.normalizeRefund(match) : null;
    } catch {
      throw new BadGatewayException('Razorpay refund reconciliation failed');
    }
  }
}
