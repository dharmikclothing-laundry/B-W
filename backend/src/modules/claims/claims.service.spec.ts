import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ClaimsService } from './claims.service';

function fluentResult(data: any, error: any = null) {
  const query: any = {};
  for (const method of ['select', 'eq', 'order']) {
    query[method] = jest.fn(() => query);
  }
  query.maybeSingle = jest.fn().mockResolvedValue({ data, error });
  return query;
}

describe('ClaimsService', () => {
  it('submits a customer claim through the atomic claim-window RPC', async () => {
    const claim = {
      id: 'claim-1',
      order_id: 'order-1',
      claim_type: 'damage',
      duplicate: false,
    };
    const rpc = jest.fn().mockResolvedValue({ data: claim, error: null });
    const service = new ClaimsService({ admin: { rpc } } as any);

    await expect(
      service.create('profile-1', 'order-1', {
        clientRequestId: '00000000-0000-4000-8000-000000000001',
        claimType: 'damage',
        description: 'A shirt was returned with a visible tear.',
      }),
    ).resolves.toEqual(claim);
    expect(rpc).toHaveBeenCalledWith('create_customer_order_claim_atomic', {
      p_order_id: 'order-1',
      p_profile_id: 'profile-1',
      p_claim_type: 'damage',
      p_description: 'A shirt was returned with a visible tear.',
      p_order_item_id: null,
      p_client_request_id: '00000000-0000-4000-8000-000000000001',
    });
  });

  it('reports an expired claim window as a conflict', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: null,
      error: {
        code: '23514',
        message: 'The order claim period has expired',
      },
    });
    const service = new ClaimsService({ admin: { rpc } } as any);

    await expect(
      service.create('profile-1', 'order-1', {
        clientRequestId: '00000000-0000-4000-8000-000000000001',
        claimType: 'quality',
        description: 'The cleaning quality does not match the order.',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('maps cross-customer claim access to forbidden', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: null,
      error: {
        code: '42501',
        message: 'Claim is not owned by this customer',
      },
    });
    const service = new ClaimsService({ admin: { rpc } } as any);

    await expect(
      service.attachPhoto('profile-2', 'claim-1', 'path.jpg'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates an owner-scoped private photo upload path', async () => {
    const customers = fluentResult({ id: 'customer-1' });
    const claims = fluentResult({
      id: 'claim-1',
      customer_id: 'customer-1',
      status: 'submitted',
      customer_claim_photos: [],
    });
    const createSignedUploadUrl = jest.fn().mockResolvedValue({
      data: {
        signedUrl: 'signed-development-url',
        token: 'signed-development-token',
      },
      error: null,
    });
    const bucket = jest.fn(() => ({ createSignedUploadUrl }));
    const service = new ClaimsService({
      admin: {
        from: jest.fn((table: string) =>
          table === 'customers' ? customers : claims,
        ),
        storage: { from: bucket },
      },
    } as any);

    const result = await service.createPhotoUpload(
      '00000000-0000-4000-8000-000000000010',
      '00000000-0000-4000-8000-000000000020',
      'damage.JPG',
    );

    expect(result.path).toMatch(
      /^00000000-0000-4000-8000-000000000010\/00000000-0000-4000-8000-000000000020\/[0-9a-f-]+[.]jpg$/,
    );
    expect(bucket).toHaveBeenCalledWith('customer-claim-photos');
    expect(createSignedUploadUrl).toHaveBeenCalledWith(result.path);
  });

  it('rejects unsupported photo types before creating an upload URL', async () => {
    const customers = fluentResult({ id: 'customer-1' });
    const claims = fluentResult({
      id: 'claim-1',
      customer_id: 'customer-1',
      status: 'submitted',
    });
    const storageFrom = jest.fn();
    const service = new ClaimsService({
      admin: {
        from: jest.fn((table: string) =>
          table === 'customers' ? customers : claims,
        ),
        storage: { from: storageFrom },
      },
    } as any);

    await expect(
      service.createPhotoUpload('profile-1', 'claim-1', 'evidence.pdf'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storageFrom).not.toHaveBeenCalled();
  });
});
