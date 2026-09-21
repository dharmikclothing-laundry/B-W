import {BadRequestException, ForbiddenException} from '@nestjs/common';
import {AdminCatalogueService} from './admin-catalogue.service';

const fixture = (result: any = {data: {id: 'record'}, error: null}) => {
  const rpc = jest.fn().mockResolvedValue(result);
  return {service: new AdminCatalogueService({admin: {rpc}} as any), rpc};
};
describe('9E Admin catalogue', () => {
  it('passes actor and scoped price into audited atomic procedure', async () => {
    const {service, rpc} = fixture();
    await service.setPrice('admin', 'service', {price: 75, facilityId: 'facility'});
    expect(rpc).toHaveBeenCalledWith('admin_catalogue_change_atomic', {p_actor_profile_id: 'admin', p_action: 'set_price', p_payload: {serviceId: 'service', price: 75, facilityId: 'facility'}});
  });
  it('rejects negative and invalid policy values before database access', async () => {
    const {service, rpc} = fixture();
    expect(() => service.setPrice('admin', 'service', {price: -1})).toThrow(BadRequestException);
    expect(() => service.setPolicy('admin', {pickupDeliveryFee: 50, freeDeliveryThreshold: 500, gstRatePercent: 101, minimumOrderAmount: 0})).toThrow(BadRequestException);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('maps role denial from the database', async () => {
    await expect(fixture({data: null, error: {code: '42501'}}).service.createCategory('driver', {name: 'Test'})).rejects.toBeInstanceOf(ForbiddenException);
  });
});
