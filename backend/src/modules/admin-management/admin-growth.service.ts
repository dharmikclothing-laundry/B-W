import {BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException} from '@nestjs/common';
import {SupabaseService} from '../supabase/supabase.service';

@Injectable()
export class AdminGrowthService {
  constructor(private readonly supabase: SupabaseService) {}
  private get db() {return this.supabase.admin;}
  async overview() {
    const [offers, redemptions, packages, subscriptions, eligibility, services, settings, referrals, loyalty, audit] = await Promise.all([
      this.db.from('offers').select('id,code,coupon_code,name,discount_type,discount_value,minimum_order_amount,maximum_discount,starts_at,expires_at,usage_limit,is_active,eligibility_note').order('name'),
      this.db.from('offer_redemptions').select('id,offer_id,order_id,discount_amount,created_at,reversed_at').order('created_at', {ascending: false}).limit(200),
      this.db.from('packages').select('id,name,description,monthly_price,price,validity_days,is_active').order('name'),
      this.db.from('package_subscriptions').select('id,package_id,customer_id,status,amount,expires_at').order('started_at', {ascending: false}).limit(200),
      this.db.from('package_services').select('id,package_id,service_id,usage_limit'),
      this.db.from('services').select('id,name,is_active').eq('is_active', true),
      this.db.from('admin_growth_settings').select('*').eq('id', true).single(),
      this.db.from('referrals').select('id,referral_code,status,reward_status,created_at').order('created_at', {ascending: false}).limit(100),
      this.db.from('loyalty_point_transactions').select('id,points,transaction_type,reference_type,created_at').order('created_at', {ascending: false}).limit(100),
      this.db.from('admin_growth_audit').select('id,actor_profile_id,action,entity_type,entity_id,created_at').order('created_at', {ascending: false}).limit(100),
    ]);
    if (offers.error || redemptions.error || packages.error || subscriptions.error || eligibility.error || services.error || settings.error || referrals.error || loyalty.error || audit.error || !settings.data)
      throw new BadRequestException('Growth configuration unavailable');
    const offerCounts = await Promise.all((offers.data ?? []).map(async offer => {
      const [active, all] = await Promise.all([
        this.db.from('offer_redemptions').select('id', {count: 'exact', head: true}).eq('offer_id', offer.id).is('reversed_at', null),
        this.db.from('offer_redemptions').select('id', {count: 'exact', head: true}).eq('offer_id', offer.id),
      ]);
      if (active.error || all.error) throw new BadRequestException('Offer redemption counts unavailable');
      return {redeemedCount: active.count ?? 0, termsLocked: (all.count ?? 0) > 0};
    }));
    const soldCounts = await Promise.all((packages.data ?? []).map(async pkg => {
      const result = await this.db.from('package_subscriptions').select('id', {count: 'exact', head: true}).eq('package_id', pkg.id);
      if (result.error) throw new BadRequestException('Package sales count unavailable');
      return result.count ?? 0;
    }));
    return {offers: (offers.data ?? []).map((offer, index) => ({...offer, ...offerCounts[index]})),
      redemptions: redemptions.data ?? [],
      packages: (packages.data ?? []).map((pkg, index) => ({...pkg,
        soldCount: soldCounts[index], termsLocked: soldCounts[index] > 0})),
      subscriptions: subscriptions.data ?? [], eligibility: eligibility.data ?? [], services: services.data ?? [],
      settings: settings.data, referrals: referrals.data ?? [], loyaltyHistory: loyalty.data ?? [], audit: audit.data ?? []};
  }
  private async change(actor: string, action: string, payload: object) {
    const {data, error} = await this.db.rpc('admin_growth_change_atomic', {p_actor: actor, p_action: action, p_payload: payload});
    if (error?.code === '42501') throw new ForbiddenException('Admin role required');
    if (error?.code === 'P0002') throw new NotFoundException(error.message);
    if (error && ['23514','23505'].includes(error.code)) throw new ConflictException(error.message);
    if (error || !data) throw new BadRequestException(error?.message ?? 'Growth change failed');
    return data;
  }
  createOffer(actor: string, payload: object) {return this.change(actor, 'create_offer', payload);}
  updateOffer(actor: string, id: string, payload: object) {return this.change(actor, 'update_offer', {...payload, id});}
  setOfferActive(actor: string, id: string, isActive: boolean) {return this.change(actor, 'set_offer_active', {id, isActive});}
  createPackage(actor: string, payload: object) {return this.change(actor, 'create_package', payload);}
  updatePackage(actor: string, id: string, payload: object) {return this.change(actor, 'update_package', {...payload, id});}
  setPackageActive(actor: string, id: string, isActive: boolean) {return this.change(actor, 'set_package_active', {id, isActive});}
  setSettings(actor: string, payload: object) {return this.change(actor, 'set_program_settings', payload);}
  async setPackageEligibility(actor: string, packageId: string, serviceId: string, eligible: boolean, usageLimit: number | null) {
    if (usageLimit !== null && (!Number.isSafeInteger(usageLimit) || usageLimit < 0)) throw new BadRequestException('Invalid package credit limit');
    const {data, error} = await this.db.rpc('admin_set_package_service_atomic', {
      p_actor_profile_id: actor, p_package_id: packageId, p_service_id: serviceId,
      p_usage_limit: usageLimit, p_eligible: eligible,
    });
    if (error?.code === '42501') throw new ForbiddenException('Admin role required');
    if (error?.code === 'P0002') throw new NotFoundException(error.message);
    if (error?.code === '23514') throw new ConflictException(error.message);
    if (error || !data) throw new BadRequestException(error?.message ?? 'Package eligibility unavailable');
    return data;
  }
}
