import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { LogisticsService } from './logistics.service';

function fixture(rpcResult: { data: any; error: any } = { data: { assignment: { id: 'job-1' } }, error: null }) {
  const driverQuery: any = {};
  driverQuery.select = jest.fn(() => driverQuery);
  driverQuery.eq = jest.fn(() => driverQuery);
  driverQuery.maybeSingle = jest.fn().mockResolvedValue({ data: { id: 'driver-1', is_active: true }, error: null });
  const rpc = jest.fn().mockResolvedValue(rpcResult);
  const service = new LogisticsService({admin: {from: jest.fn(() => driverQuery), rpc}} as any, {} as any);
  return {service, rpc};
}

describe('7C assignment decisions', () => {
  it('requires a nonempty rejection reason before touching the database', async () => {
    const {service, rpc} = fixture();
    await expect(service.respondToAssignment('driver-profile', 'job-1', false, '  ')).rejects.toBeInstanceOf(BadRequestException);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('uses the authenticated driver identity for accept and reject', async () => {
    const {service, rpc} = fixture();
    await service.respondToAssignment('driver-profile', 'job-1', true);
    await service.respondToAssignment('driver-profile', 'job-1', false, '  Route blocked  ');
    expect(rpc).toHaveBeenNthCalledWith(1, 'transition_driver_assignment_atomic', {
      p_assignment_id: 'job-1', p_driver_id: 'driver-1', p_action: 'accept', p_rejection_reason: null,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'transition_driver_assignment_atomic', {
      p_assignment_id: 'job-1', p_driver_id: 'driver-1', p_action: 'reject', p_rejection_reason: 'Route blocked',
    });
  });

  it('rejects wrong-driver and stale or duplicate decisions', async () => {
    await expect(fixture({data: null, error: {code: 'P0002'}}).service.respondToAssignment('driver-profile', 'job-1', true)).rejects.toBeInstanceOf(NotFoundException);
    await expect(fixture({data: null, error: {code: '23514', message: 'Assignment can no longer be responded to'}}).service.respondToAssignment('driver-profile', 'job-1', true)).rejects.toBeInstanceOf(ConflictException);
  });

  it('passes the caller profile into the atomic Admin-only reassignment function', async () => {
    const {service, rpc} = fixture();
    await service.reassignDriver('admin-profile', 'job-1', 'driver-2');
    expect(rpc).toHaveBeenCalledWith('reassign_driver_assignment_atomic', {
      p_assignment_id: 'job-1', p_admin_profile_id: 'admin-profile', p_new_driver_id: 'driver-2',
    });
    await expect(fixture({data: null, error: {code: '42501'}}).service.reassignDriver('driver-profile', 'job-1', 'driver-2')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
