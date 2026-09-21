import {ConflictException, ForbiddenException} from '@nestjs/common';
import {AdminAssignmentsService} from './admin-assignments.service';

const fixture = (result: any = {data: {assignment: {id: 'new'}}, error: null}) => {
  const rpc = jest.fn().mockResolvedValue(result);
  return {service: new AdminAssignmentsService({admin: {rpc}} as any), rpc};
};

describe('9D Admin assignment operations', () => {
  it('uses the actor and existing atomic assignment contract', async () => {
    const {service, rpc} = fixture();
    await service.assign('admin', 'order', 'driver', 'pickup');
    expect(rpc).toHaveBeenCalledWith('admin_assign_driver_atomic', {
      p_admin_profile_id: 'admin', p_order_id: 'order', p_driver_id: 'driver', p_assignment_type: 'pickup',
    });
  });
  it('uses atomic reassignment with the old assignment ID', async () => {
    const {service, rpc} = fixture();
    await service.reassign('admin', 'old', 'new-driver');
    expect(rpc).toHaveBeenCalledWith('admin_reassign_driver_atomic', {
      p_admin_profile_id: 'admin', p_assignment_id: 'old', p_new_driver_id: 'new-driver',
    });
  });
  it('blocks non-Admin calls and stale conflicts', async () => {
    await expect(fixture({data: null, error: {code: '42501'}}).service.assign('driver', 'order', 'other', 'pickup')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(fixture({data: null, error: {code: '23514', message: 'stale'}}).service.reassign('admin', 'old', 'new')).rejects.toBeInstanceOf(ConflictException);
  });
});
