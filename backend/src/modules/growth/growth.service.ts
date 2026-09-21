import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'; import { SupabaseService } from '../supabase/supabase.service';
@Injectable() export class GrowthService {
 constructor(private readonly supabase:SupabaseService){} private db(){return this.supabase.admin;}
 async applyCoupon(_profileId:string,code:string,orderAmount:number){
  if(!code?.trim() || !/^[A-Za-z0-9-]{1,64}$/.test(code.trim()) || !Number.isFinite(orderAmount) || orderAmount<=0)throw new BadRequestException('Valid coupon and order amount required');
  const {data:offer,error}=await this.db().from('offers').select('*').ilike('coupon_code',code.trim()).eq('is_active',true).maybeSingle();
  if(error||!offer)throw new NotFoundException('Coupon not found');
  const now=Date.now();
  if((offer.starts_at && Date.parse(offer.starts_at)>now)||(offer.expires_at && Date.parse(offer.expires_at)<=now))throw new BadRequestException('Coupon is not currently available');
  if(offer.usage_limit!=null){
    const {count,error:usageError}=await this.db().from('offer_redemptions').select('id',{count:'exact',head:true}).eq('offer_id',offer.id).is('reversed_at',null);
    if(usageError||count==null)throw new BadRequestException('Coupon usage unavailable');
    if(count>=Number(offer.usage_limit))throw new BadRequestException('Coupon usage limit reached');
  }
  if(orderAmount<Number(offer.minimum_order_amount||0))throw new BadRequestException('Minimum order value not met');
  const raw=offer.discount_type==='percentage'?orderAmount*Number(offer.discount_value)/100:Number(offer.discount_value);
  const discount=Math.round(Math.min(Math.max(raw,0),Number(offer.maximum_discount??orderAmount),orderAmount)*100)/100;
  return {offerId:offer.id,code:code.trim().toUpperCase(),discount};
 }
 async activeOffers(){
  const {data,error}=await this.db().from('offers').select('id,name,coupon_code,discount_type,discount_value,minimum_order_amount,maximum_discount,starts_at,expires_at,usage_limit').eq('is_active',true).order('name');
  if(error)throw new BadRequestException('Offers unavailable');
  const now=Date.now();
  const available=[];
  for(const offer of data||[]){
    if((offer.starts_at&&Date.parse(offer.starts_at)>now)||(offer.expires_at&&Date.parse(offer.expires_at)<=now))continue;
    if(offer.usage_limit!=null){
      const {count,error:usageError}=await this.db().from('offer_redemptions').select('id',{count:'exact',head:true}).eq('offer_id',offer.id).is('reversed_at',null);
      if(usageError||count==null)throw new BadRequestException('Offer usage unavailable');
      if(count>=Number(offer.usage_limit))continue;
    }
    available.push(offer);
  }
  return available;
 }
 async referralInfo(profileId:string){
  const {data:customer,error:customerError}=await this.db().from('customers').select('id,referral_code').eq('profile_id',profileId).single();
  if(customerError||!customer)throw new NotFoundException('Customer profile required');
  const {data,error}=await this.db().from('referrals').select('*').eq('referrer_customer_id',customer.id).order('created_at',{ascending:false});
  if(error)throw new BadRequestException('Referral history unavailable');
  return {code:customer.referral_code,history:data||[]};
 }
 async referral(profileId:string,referralCode:string){
  if(!referralCode?.trim())throw new BadRequestException('Referral code required');
  const rules=await this.rules();
  if(!rules.referral_enabled)throw new BadRequestException('Referrals are unavailable');
  const {data:referrer}=await this.db().from('customers').select('id,referral_code').eq('referral_code',referralCode.trim().toUpperCase()).maybeSingle();if(!referrer)throw new NotFoundException('Referral code invalid');
  const {data:customer}=await this.db().from('customers').select('id').eq('profile_id',profileId).single();if(!customer)throw new NotFoundException();
  if(referrer.id===customer.id)throw new BadRequestException('Self referral is not allowed');
  const {data,error}=await this.db().from('referrals').insert({referrer_customer_id:referrer.id,referred_customer_id:customer.id,referral_code:referrer.referral_code,status:'registered'}).select().single();
  if(error)throw new BadRequestException(error.message);return data;
 }
 async rules(){const {data,error}=await this.db().from('admin_growth_settings').select('*').eq('id',true).single();if(error||!data)throw new BadRequestException('Growth rules unavailable');return data;}
 async points(profileId:string){const {data:c}=await this.db().from('customers').select('id').eq('profile_id',profileId).single();if(!c)throw new NotFoundException();const {data,error}=await this.db().from('loyalty_point_transactions').select('*').eq('customer_id',c.id).order('created_at',{ascending:false});if(error)throw new BadRequestException(error.message);const transactions=data||[];const rules=await this.rules();return {balance:transactions.reduce((sum:number,row:any)=>sum+Number(row.points),0),transactions,rules};}
 async redeem(_profileId:string,_points:number,_reason:string):Promise<never>{
  throw new BadRequestException('Redeem points during checkout');
 }
}
