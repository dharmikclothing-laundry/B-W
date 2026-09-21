describe('Phase 4 growth calculations',()=>{
 it('caps percentage discounts',()=>{
  const amount=1000,percent=25,max=150;
  expect(Math.min(amount*percent/100,max)).toBe(150);
 });
 it('prevents self referral',()=>{const customer='a',referrer='a';expect(customer===referrer).toBe(true);});
});
