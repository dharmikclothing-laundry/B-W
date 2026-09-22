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
    jest.spyOn(service, 'assignBestDriver').mockResolvedValue({assignment: {id: 'job-2'}, scoring: {}} as any);
    await service.respondToAssignment('driver-profile', 'job-1', true);
    await service.respondToAssignment('driver-profile', 'job-1', false, '  Route blocked  ');
    expect(rpc).toHaveBeenNthCalledWith(1, 'transition_driver_assignment_atomic', {
      p_assignment_id: 'job-1', p_driver_id: 'driver-1', p_action: 'accept', p_rejection_reason: null,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'transition_driver_assignment_atomic', {
      p_assignment_id: 'job-1', p_driver_id: 'driver-1', p_action: 'reject', p_rejection_reason: 'Route blocked',
    });
  });

  it('reassigns a rejected offer without cancelling the order', async () => {
    const {service} = fixture({
      data: {
        assignment: {id: 'job-1', assignment_type: 'pickup'},
        orderId: 'order-1',
      },
      error: null,
    });
    const assign = jest.spyOn(service, 'assignBestDriver').mockResolvedValue({
      assignment: {id: 'job-2'},
      scoring: {},
    } as any);
    await expect(
      service.respondToAssignment('driver-profile', 'job-1', false, 'Too far'),
    ).resolves.toMatchObject({reassigned: true, replacementAssignmentId: 'job-2'});
    expect(assign).toHaveBeenCalledWith('order-1', 'pickup');
  });

  it('records customer unavailability only through the arrival outcome RPC', async () => {
    const {service, rpc} = fixture({
      data: {assignmentId: 'job-1', orderId: 'order-1', orderStatus: 'cancelled'},
      error: null,
    });
    await service.reportCustomerUnavailable(
      'driver-profile',
      'job-1',
      'customer_not_home',
    );
    expect(rpc).toHaveBeenCalledWith(
      'resolve_driver_customer_unavailable_atomic',
      {
        p_assignment_id: 'job-1',
        p_driver_id: 'driver-1',
        p_outcome: 'customer_not_home',
      },
    );
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

describe('daily pickup eligibility', () => {
  function serviceFor(order: any) {
    const query: any = {};
    query.select = jest.fn(() => query);
    query.eq = jest.fn(() => query);
    query.maybeSingle = jest.fn().mockResolvedValue({data: order, error: null});
    const service = new LogisticsService(
      {admin: {from: jest.fn(() => query)}} as any,
      {} as any,
    );
    return service;
  }

  it('assigns a paid pickup immediately when its slot is today', async () => {
    const now = new Date('2026-09-22T05:00:00.000Z');
    const service = serviceFor({
      id: 'order-1',
      current_status: 'confirmed',
      pickup_scheduled_at: '2026-09-22T06:00:00.000Z',
    });
    jest.spyOn(service, 'assignBestDriver').mockResolvedValue({
      assignment: {id: 'job-1'},
      scoring: {},
    } as any);
    await expect(service.assignPickupIfDueToday('order-1', now)).resolves.toMatchObject({
      assigned: true,
    });
  });

  it('leaves a future pickup confirmed for midnight assignment', async () => {
    const now = new Date('2026-09-22T05:00:00.000Z');
    const service = serviceFor({
      id: 'order-1',
      current_status: 'confirmed',
      pickup_scheduled_at: '2026-09-23T06:00:00.000Z',
    });
    const assign = jest.spyOn(service, 'assignBestDriver');
    await expect(service.assignPickupIfDueToday('order-1', now)).resolves.toEqual({
      assigned: false,
      reason: 'future_pickup',
    });
    expect(assign).not.toHaveBeenCalled();
  });
});
