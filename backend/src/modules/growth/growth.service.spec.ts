import {BadRequestException} from '@nestjs/common';
import {GrowthService} from './growth.service';

function query(result: {data: any; error?: any}) {
  const chain: any = {};
  for (const method of ['select', 'eq', 'ilike', 'order']) chain[method] = jest.fn(() => chain);
  chain.maybeSingle = jest.fn().mockResolvedValue(result);
  chain.single = jest.fn().mockResolvedValue(result);
  chain.then = (resolve: any) => Promise.resolve(result).then(resolve);
  return chain;
}

describe('GrowthService', () => {
  it('rejects unavailable and ineligible coupons and caps discounts', async () => {
    const offer = {id: 'offer-1', discount_type: 'percentage', discount_value: 50,
      minimum_order_amount: 100, maximum_discount: 20, is_active: true};
    const from = jest.fn(() => query({data: offer}));
    const growth = new GrowthService({admin: {from}} as any);
    await expect(growth.applyCoupon('profile', ' save ', 200)).resolves.toEqual({
      offerId: 'offer-1', code: 'SAVE', discount: 20,
    });
    expect(from).toHaveBeenCalledWith('offers');
    await expect(growth.applyCoupon('profile', 'SAVE', 50)).rejects.toBeInstanceOf(BadRequestException);
    await expect(growth.applyCoupon('profile', '', 200)).rejects.toBeInstanceOf(BadRequestException);
    await expect(growth.applyCoupon('profile', '%', 200)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects expired coupons', async () => {
    const growth = new GrowthService({admin: {from: () => query({data: {
      id: 'expired', expires_at: '2020-01-01T00:00:00Z', minimum_order_amount: 0,
    }})}} as any);
    await expect(growth.applyCoupon('profile', 'OLD', 100)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('allows an available limited coupon and rejects it at the cap', async () => {
    const offer = {id: 'limited', discount_type: 'fixed', discount_value: 10,
      minimum_order_amount: 0, maximum_discount: null, usage_limit: 2};
    const usage = (count: number) => {
      const chain: any = {}; for (const method of ['select', 'eq', 'is']) chain[method] = jest.fn(() => chain);
      chain.then = (resolve: any) => Promise.resolve({count, error: null}).then(resolve); return chain;
    };
    let used = 1;
    const growth = new GrowthService({admin: {from: (table: string) => table === 'offers' ? query({data: offer}) : usage(used)}} as any);
    await expect(growth.applyCoupon('customer', 'LIMITED', 100)).resolves.toMatchObject({discount: 10});
    used = 2;
    await expect(growth.applyCoupon('customer', 'LIMITED', 100)).rejects.toThrow('usage limit');
  });
  it('rejects standalone redemption and never deducts points outside checkout', async () => {
    const rpc = jest.fn();
    const growth = new GrowthService({admin: {from: () => query({data: {id: 'customer-1'}}), rpc}} as any);
    await expect(growth.redeem('profile', -1, 'reward')).rejects.toBeInstanceOf(BadRequestException);
    await expect(growth.redeem('profile', 100, 'reward')).rejects.toThrow('checkout');
    expect(rpc).not.toHaveBeenCalled();
  });
});
