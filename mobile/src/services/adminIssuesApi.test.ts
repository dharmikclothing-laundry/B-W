import {apiRequest} from './api';
import {approveAdminRefund, decideAdminClaim, rejectAdminRefund, requestAdminRefund} from './adminIssuesApi';
jest.mock('./api', () => ({apiRequest: jest.fn()}));
beforeEach(() => jest.clearAllMocks());
test('claim decisions require notes and scope claim under order', () => {
  expect(() => decideAdminClaim('token', 'o1', 'c1', 'approved', '  ')).toThrow('decision notes');
  decideAdminClaim('token', 'o1', 'c1', 'approved', 'Evidence reviewed');
  expect(apiRequest).toHaveBeenCalledWith('/admin/issues/orders/o1/claims/c1/decision',
    {accessToken: 'token', method: 'POST', body: {status: 'approved', notes: 'Evidence reviewed'}});
});
test('refund amount and reason validation precede request', () => {
  expect(() => requestAdminRefund('token', 'o1', 'p1', 0, 'Reason')).toThrow('positive refund amount');
  expect(() => requestAdminRefund('token', 'o1', 'p1', 1.001, 'Reason')).toThrow('positive refund amount');
  expect(() => requestAdminRefund('token', 'o1', 'p1', 10, '  ')).toThrow('decision notes');
  requestAdminRefund('token', 'o1', 'p1', 10, 'Customer issue');
  expect(apiRequest).toHaveBeenCalledWith('/admin/issues/orders/o1/payments/p1/refunds',
    {accessToken: 'token', method: 'POST', body: {amount: 10, reason: 'Customer issue'}});
});
test('approval and rejection remain Admin endpoints with required notes', () => {
  approveAdminRefund('token', 'o1', 'r1', 'Approved');
  rejectAdminRefund('token', 'o1', 'r2', 'Declined');
  expect(apiRequest).toHaveBeenCalledWith('/admin/issues/orders/o1/refunds/r1/approve',
    {accessToken: 'token', method: 'POST', body: {notes: 'Approved'}});
  expect(apiRequest).toHaveBeenCalledWith('/admin/issues/orders/o1/refunds/r2/reject',
    {accessToken: 'token', method: 'POST', body: {notes: 'Declined'}});
});
