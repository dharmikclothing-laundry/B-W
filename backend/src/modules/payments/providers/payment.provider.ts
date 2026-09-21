export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export type ProviderPaymentOrder = {
  id: string;
  amount: number;
  currency: string;
};

export type ProviderPayment = {
  id: string;
  orderId: string;
  amount: number;
  currency: string;
  status: 'captured' | 'failed' | string;
};

export type ProviderRefund = {
  id: string;
  paymentId: string;
  amount: number;
  currency: string;
  status: 'processed' | 'pending' | 'failed' | string;
  reference: string | null;
};

export interface PaymentProvider {
  readonly mode: 'mock' | 'live';
  readonly publicKeyId: string | null;

  createOrder(input: {
    amount: number;
    currency: string;
    receipt: string;
  }): Promise<ProviderPaymentOrder>;

  verifyCheckoutSignature(input: {
    providerOrderId: string;
    providerPaymentId: string;
    signature: string;
  }): boolean;

  fetchPayment(providerPaymentId: string): Promise<ProviderPayment>;

  refundPayment(input: {
    providerPaymentId: string;
    amount: number;
    currency: string;
    reference: string;
  }): Promise<ProviderRefund>;

  fetchRefund(providerRefundId: string): Promise<ProviderRefund>;

  findRefundByReference(input: {
    providerPaymentId: string;
    reference: string;
  }): Promise<ProviderRefund | null>;
}

export type MockPaymentSimulation = {
  payment: ProviderPayment;
  signature: string;
};

export interface DevelopmentPaymentProvider extends PaymentProvider {
  readonly mode: 'mock';
  simulatePayment(input: {
    providerOrderId: string;
    amount: number;
    currency: string;
    status: 'captured' | 'failed';
  }): Promise<MockPaymentSimulation>;
}

export function isDevelopmentPaymentProvider(
  provider: PaymentProvider,
): provider is DevelopmentPaymentProvider {
  return (
    provider.mode === 'mock' &&
    typeof (provider as DevelopmentPaymentProvider).simulatePayment ===
      'function'
  );
}
