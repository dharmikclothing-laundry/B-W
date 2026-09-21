import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { SupabaseService } from '../supabase/supabase.service';
import {PAYMENT_PROVIDER, isDevelopmentPaymentProvider} from '../payments/providers/payment.provider';
import type {PaymentProvider} from '../payments/providers/payment.provider';

@Injectable()
export class PackagesService {
  constructor(
    private readonly supabase: SupabaseService,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
  ) {}

  private db() {
    return this.supabase.admin;
  }

  async list() {
    const {
      data,
      error,
    } = await this.db()
      .from('packages')
      .select('*,package_services(*)')
      .eq('is_active', true);

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data ?? [];
  }

  async detail(packageId: string) {
    const {data, error} = await this.db().from('packages')
      .select('*,package_services(*)').eq('id', packageId).eq('is_active', true).maybeSingle();
    if (error || !data) throw new NotFoundException('Package not found');
    return data;
  }

  private async customerId(profileId: string) {
    const {data, error} = await this.db().from('customers')
      .select('id').eq('profile_id', profileId).maybeSingle();
    if (error || !data) throw new NotFoundException('Customer not found');
    return data.id as string;
  }

  async mine(profileId: string) {
    const customerId = await this.customerId(profileId);
    const {data: subscriptions, error} = await this.db().from('package_subscriptions')
      .select('*,packages(*,package_services(*))')
      .eq('customer_id', customerId).order('started_at', {ascending: false});
    if (error) throw new BadRequestException('Package history unavailable');
    const {data: usage, error: usageError} = await this.db().from('package_usage')
      .select('subscription_id,service_id,usage_quantity,reversed_at,order_id,created_at')
      .eq('customer_id', customerId);
    if (usageError) throw new BadRequestException('Package usage unavailable');
    const now = Date.now();
    return (subscriptions ?? []).map((subscription: any) => ({
      ...subscription,
      isUsable: subscription.status === 'active' &&
        Date.parse(subscription.starts_at ?? subscription.started_at) <= now &&
        Date.parse(subscription.expires_at) > now,
      services: (subscription.packages?.package_services ?? []).map((service: any) => {
        const used = (usage ?? []).filter((row: any) => row.subscription_id === subscription.id &&
          row.service_id === service.service_id && !row.reversed_at)
          .reduce((sum: number, row: any) => sum + Number(row.usage_quantity), 0);
        return {...service, used, remaining: service.usage_limit == null ? null : Math.max(0, Number(service.usage_limit) - used)};
      }),
      usage: (usage ?? []).filter((row: any) => row.subscription_id === subscription.id),
    }));
  }

  async quote(profileId: string, subscriptionId: string,
    items: Array<{service_id: string; quantity: number; unit_price: number}>) {
    const customerId = await this.customerId(profileId);
    const {data: subscription, error} = await this.db().from('package_subscriptions')
      .select('id,customer_id,package_id,status,starts_at,expires_at')
      .eq('id', subscriptionId).eq('customer_id', customerId).maybeSingle();
    const now = Date.now();
    if (error || !subscription || subscription.status !== 'active' ||
        Date.parse(subscription.starts_at) > now || Date.parse(subscription.expires_at) <= now) {
      throw new BadRequestException('Package is unavailable or expired');
    }
    const {data: limits, error: limitsError} = await this.db().from('package_services')
      .select('service_id,usage_limit').eq('package_id', subscription.package_id);
    const {data: usage, error: usageError} = await this.db().from('package_usage')
      .select('service_id,usage_quantity').eq('subscription_id', subscriptionId).is('reversed_at', null);
    if (limitsError || usageError) throw new BadRequestException('Package balance unavailable');
    const coverages = items.map(item => {
      const limit = (limits ?? []).find((row: any) => row.service_id === item.service_id);
      if (!limit) return {service_id: item.service_id, quantity: 0};
      const used = (usage ?? []).filter((row: any) => row.service_id === item.service_id)
        .reduce((sum: number, row: any) => sum + Number(row.usage_quantity), 0);
      const remaining = limit.usage_limit == null ? item.quantity : Math.max(0, Number(limit.usage_limit) - used);
      return {service_id: item.service_id, quantity: Math.min(item.quantity, remaining)};
    }).filter(row => row.quantity > 0);
    return {subscriptionId, coverages,
      discount: coverages.reduce((sum, row) => sum + row.quantity * Number(items.find(item => item.service_id === row.service_id)!.unit_price), 0)};
  }

  async subscribe(
    profileId: string,
    packageId: string,
  ) {
    if (process.env.NODE_ENV === 'production' || !isDevelopmentPaymentProvider(this.paymentProvider)) {
      throw new ServiceUnavailableException('Package purchase requires a configured payment flow');
    }
    const {
      data: customer,
      error: customerError,
    } = await this.db()
      .from('customers')
      .select('id')
      .eq('profile_id', profileId)
      .maybeSingle();

    if (customerError || !customer) {
      throw new NotFoundException(
        'Customer not found',
      );
    }

    const {
      data: pkg,
      error: packageError,
    } = await this.db()
      .from('packages')
      .select('id,monthly_price,is_active,validity_days')
      .eq('id', packageId)
      .eq('is_active', true)
      .maybeSingle();

    if (packageError || !pkg) {
      throw new NotFoundException(
        'Package not found',
      );
    }

    const amountPaise = Math.round(Number(pkg.monthly_price) * 100);
    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
      throw new BadRequestException('Package price is not payable');
    }
    const providerOrder = await this.paymentProvider.createOrder({
      amount: amountPaise, currency: 'INR', receipt: `BW-PKG-${packageId.slice(0, 12)}`,
    });
    const captured = await this.paymentProvider.simulatePayment({
      providerOrderId: providerOrder.id, amount: amountPaise, currency: 'INR', status: 'captured',
    });
    if (captured.payment.status !== 'captured' || captured.payment.amount !== amountPaise ||
        !this.paymentProvider.verifyCheckoutSignature({
          providerOrderId: providerOrder.id, providerPaymentId: captured.payment.id,
          signature: captured.signature,
        })) throw new BadRequestException('Mock package payment failed');
    const start = new Date();
    const end = new Date(start);
    if (pkg.validity_days != null) {
      end.setUTCDate(end.getUTCDate() + Number(pkg.validity_days));
    } else {
      // Existing package templates retain their calendar-month validity.
      const day = start.getUTCDate();
      end.setUTCDate(1);
      end.setUTCMonth(end.getUTCMonth() + 1);
      const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
      end.setUTCDate(Math.min(day, lastDay));
    }

    const {
      data,
      error,
    } = await this.db()
      .from('package_subscriptions')
      .insert({
        customer_id: customer.id,
        package_id: packageId,
        status: 'active',
        starts_at: start.toISOString(),
        started_at: start.toISOString(),
        expires_at: end.toISOString(),
        amount: Number(pkg.monthly_price),
        payment_provider: 'mock',
        payment_reference: captured.payment.id,
        paid_at: start.toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data;
  }

  async usage(
    profileId: string,
  ) {
    const {
      data: customer,
      error: customerError,
    } = await this.db()
      .from('customers')
      .select('id')
      .eq('profile_id', profileId)
      .maybeSingle();

    if (customerError || !customer) {
      throw new NotFoundException(
        'Customer not found',
      );
    }

    const {
      data,
      error,
    } = await this.db()
      .from('package_usage')
      .select('*,package_services(*)')
      .eq('customer_id', customer.id);

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data ?? [];
  }
}
