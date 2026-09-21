import {BadRequestException, ConflictException, ForbiddenException} from '@nestjs/common';
import {AdminGrowthService} from './admin-growth.service';

const fixture = (result: any = {data: {id: 'result'}, error: null}) => {
  const rpc = jest.fn().mockResolvedValue(result);
  return {service: new AdminGrowthService({admin: {rpc}} as any), rpc};
};
describe('9G Admin growth management', () => {
  it('passes actor and offer terms to the audited atomic procedure', async () => {
    const {service, rpc} = fixture();
    const input = {couponCode: 'SAVE10', name: 'Fictional', discountType: 'fixed', discountValue: 10,
      minimumOrderAmount: 100, maximumDiscount: null, startsAt: null, expiresAt: null, usageLimit: 1};
    await service.createOffer('admin', input);
    expect(rpc).toHaveBeenCalledWith('admin_growth_change_atomic', {p_actor: 'admin', p_action: 'create_offer', p_payload: input});
  });
  it('maps database role and sold-contract denials', async () => {
    await expect(fixture({data: null, error: {code: '42501'}}).service.createPackage('driver', {})).rejects.toBeInstanceOf(ForbiddenException);
    await expect(fixture({data: null, error: {code: '23514', message: 'Sold package terms are locked'}})
      .service.updatePackage('admin', 'package', {})).rejects.toBeInstanceOf(ConflictException);
  });
  it('reuses existing package eligibility procedure and validates credits', async () => {
    const {service, rpc} = fixture();
    await expect(service.setPackageEligibility('admin', 'p1', 's1', true, -1)).rejects.toBeInstanceOf(BadRequestException);
    await service.setPackageEligibility('admin', 'p1', 's1', true, 5);
    expect(rpc).toHaveBeenCalledWith('admin_set_package_service_atomic', {p_actor_profile_id: 'admin', p_package_id: 'p1', p_service_id: 's1', p_eligible: true, p_usage_limit: 5});
  });
});
