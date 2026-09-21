import {ServiceUnavailableException} from '@nestjs/common';
import {PackagesService} from './packages.service';
import type {SupabaseService} from '../supabase/supabase.service';
import type {PaymentProvider} from '../payments/providers/payment.provider';

function database(rows: Record<string, unknown>) {
  const from = jest.fn((table: string) => {
    const query: any = {
      select: () => query, eq: () => query, order: () => query, is: () => query,
      maybeSingle: async () => ({data: rows[table] ?? null, error: null}),
      insert: () => query,
      single: async () => ({data: {id: 'subscription-1'}, error: null}),
      then: (resolve: (value: unknown) => void) => resolve({data: rows[table] ?? [], error: null}),
    };
    return query;
  });
  return {admin: {from}} as unknown as SupabaseService;
}

const mockProvider = {
  mode: 'mock', createOrder: jest.fn().mockResolvedValue({id: 'provider-order'}),
  simulatePayment: jest.fn().mockResolvedValue({payment: {id: 'mock-payment', amount: 9900, status: 'captured'}, signature: 'signature'}),
  verifyCheckoutSignature: jest.fn().mockReturnValue(true),
} as unknown as PaymentProvider;

describe('package purchase safety', () => {
  const originalEnv = process.env.NODE_ENV;
  afterEach(() => {process.env.NODE_ENV = originalEnv; jest.clearAllMocks();});
  it('rejects package purchase when a live provider is configured', async () => {
    const service = new PackagesService(database({}), {...mockProvider, mode: 'live'} as PaymentProvider);
    await expect(service.subscribe('profile', 'package')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('activates a package only after a captured mock payment', async () => {
    process.env.NODE_ENV = 'test';
    const db = database({customers: {id: 'customer-1'}, packages: {id: 'package-1', monthly_price: 99, is_active: true}});
    const service = new PackagesService(db, mockProvider);
    await expect(service.subscribe('profile', 'package-1')).resolves.toEqual({id: 'subscription-1'});
    expect(mockProvider.createOrder).toHaveBeenCalledWith(expect.objectContaining({amount: 9900, currency: 'INR'}));
    expect(db.admin.from).toHaveBeenCalledWith('package_subscriptions');
  });
  it('uses the configured validity for new packages without changing an existing subscription', async () => {
    process.env.NODE_ENV = 'test';
    const db = database({customers: {id: 'customer-1'}, packages: {id: 'package-1', monthly_price: 99, is_active: true, validity_days: 45}});
    const originalFrom = (db.admin.from as jest.Mock).getMockImplementation()!;
    let insert: any;
    (db.admin.from as jest.Mock).mockImplementation((table: string) => {
      const query: any = originalFrom(table);
      if (table === 'package_subscriptions') query.insert = (value: any) => {insert = value; return query;};
      return query;
    });
    await new PackagesService(db, mockProvider).subscribe('profile', 'package-1');
    expect(Math.round((Date.parse(insert.expires_at) - Date.parse(insert.starts_at)) / 86400000)).toBe(45);
  });
});
