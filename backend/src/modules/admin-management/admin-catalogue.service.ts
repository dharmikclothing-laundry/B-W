import {BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException} from '@nestjs/common';
import {SupabaseService} from '../supabase/supabase.service';

type CategoryInput = {name?: string; description?: string; isActive?: boolean};
type ServiceInput = {name?: string; description?: string; pricingUnit?: string; categoryId?: string | null; isActive?: boolean};

@Injectable()
export class AdminCatalogueService {
  constructor(private readonly supabase: SupabaseService) {}
  private get db() { return this.supabase.admin; }

  async overview() {
    const now = new Date().toISOString();
    const [categories, services, prices, policies, eligibility, packages, subscriptions, audit] = await Promise.all([
      this.db.from('service_categories').select('id,name,description,is_active').order('name'),
      this.db.from('services').select('id,category_id,name,description,pricing_unit,is_active').order('name'),
      this.db.from('service_prices').select('id,service_id,facility_id,price,effective_from,effective_to')
        .lte('effective_from', now).or(`effective_to.is.null,effective_to.gt.${now}`).order('effective_from', {ascending: false}),
      this.db.from('checkout_pricing_policies').select('id,pickup_delivery_fee,free_delivery_threshold,gst_rate_percent,minimum_order_amount,effective_from')
        .lte('effective_from', now).order('effective_from', {ascending: false}).limit(1).maybeSingle(),
      this.db.from('package_services').select('package_id,service_id,usage_limit'),
      this.db.from('packages').select('id,name,is_active').order('name'),
      this.db.from('package_subscriptions').select('package_id'),
      this.db.from('admin_catalogue_audit').select('id,actor_profile_id,action,entity_id,created_at')
        .order('created_at', {ascending: false}).limit(100),
    ]);
    if (categories.error || services.error || prices.error || policies.error || eligibility.error || packages.error || subscriptions.error || audit.error || !policies.data)
      throw new BadRequestException('Unable to load commercial configuration');
    return {categories: categories.data ?? [], services: services.data ?? [], prices: prices.data ?? [],
      policy: {pickupDeliveryFee: Number(policies.data.pickup_delivery_fee),
        freeDeliveryThreshold: Number(policies.data.free_delivery_threshold),
        gstRatePercent: Number(policies.data.gst_rate_percent), minimumOrderAmount: Number(policies.data.minimum_order_amount),
        effectiveFrom: policies.data.effective_from},
      packageEligibility: eligibility.data ?? [],
      packages: (packages.data ?? []).map(row => ({...row, isLocked: (subscriptions.data ?? []).some(sub => sub.package_id === row.id)})),
      audit: audit.data ?? []};
  }

  private async change(actorId: string, action: string, payload: Record<string, unknown>) {
    const {data, error} = await this.db.rpc('admin_catalogue_change_atomic', {
      p_actor_profile_id: actorId, p_action: action, p_payload: payload,
    });
    if (error?.code === '42501') throw new ForbiddenException('Admin role required');
    if (error?.code === 'P0002') throw new NotFoundException('Catalogue record not found');
    if (error && ['23514', '23505'].includes(error.code)) throw new ConflictException(error.message);
    if (error || !data) throw new BadRequestException(error?.message ?? 'Unable to update catalogue');
    return data;
  }
  createCategory(actor: string, input: CategoryInput) { return this.change(actor, 'create_category', input); }
  updateCategory(actor: string, id: string, input: CategoryInput) { return this.change(actor, 'update_category', {...input, id}); }
  createService(actor: string, input: ServiceInput) { return this.change(actor, 'create_service', input); }
  updateService(actor: string, id: string, input: ServiceInput) { return this.change(actor, 'update_service', {...input, id}); }
  setPrice(actor: string, serviceId: string, input: {price: number; facilityId?: string | null}) {
    if (!Number.isFinite(input.price) || input.price < 0 || input.price > 9999999999.99 ||
      Math.abs(Math.round(input.price * 100) - input.price * 100) > 0.000001) throw new BadRequestException('Invalid service price');
    return this.change(actor, 'set_price', {...input, serviceId});
  }
  setPolicy(actor: string, input: {pickupDeliveryFee: number; freeDeliveryThreshold: number; gstRatePercent: number; minimumOrderAmount: number}) {
    for (const number of [input.pickupDeliveryFee, input.freeDeliveryThreshold, input.gstRatePercent, input.minimumOrderAmount]) {
      if (!Number.isFinite(number) || number < 0 || Math.abs(Math.round(number * 100) - number * 100) > 0.000001)
        throw new BadRequestException('Invalid pricing policy');
    }
    if (input.gstRatePercent > 100) throw new BadRequestException('Invalid GST rate');
    return this.db.rpc('admin_set_checkout_policy_atomic', {
      p_actor_profile_id: actor, p_fee: input.pickupDeliveryFee, p_free_threshold: input.freeDeliveryThreshold,
      p_gst_rate: input.gstRatePercent, p_minimum_order: input.minimumOrderAmount,
    }).then(({data, error}) => {
      if (error?.code === '42501') throw new ForbiddenException('Admin role required');
      if (error || !data) throw new BadRequestException(error?.message ?? 'Unable to update checkout policy');
      return data;
    });
  }
  async setPackageEligibility(actor: string, packageId: string, serviceId: string, eligible: boolean, usageLimit: number | null) {
    if (!Number.isSafeInteger(usageLimit) && usageLimit !== null || (usageLimit !== null && usageLimit < 0))
      throw new BadRequestException('Invalid package usage limit');
    const {data, error} = await this.db.rpc('admin_set_package_service_atomic', {
      p_actor_profile_id: actor, p_package_id: packageId, p_service_id: serviceId,
      p_usage_limit: usageLimit, p_eligible: eligible,
    });
    if (error?.code === '42501') throw new ForbiddenException('Admin role required');
    if (error?.code === '23514') throw new ConflictException(error.message);
    if (error?.code === 'P0002') throw new NotFoundException(error.message);
    if (error || !data) throw new BadRequestException(error?.message ?? 'Unable to update package eligibility');
    return data;
  }
}
