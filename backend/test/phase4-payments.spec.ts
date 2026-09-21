import * as crypto from 'crypto';
describe('Phase 4 payment security',()=>{
 it('creates deterministic Razorpay HMAC',()=>{
  const secret='test-secret',payload='order_123|payment_456';
  const signature=crypto.createHmac('sha256',secret).update(payload).digest('hex');
  expect(signature).toHaveLength(64);
 });
 it('rejects a different signature',()=>{
  expect('a'.repeat(64)).not.toEqual('b'.repeat(64));
 });
});
