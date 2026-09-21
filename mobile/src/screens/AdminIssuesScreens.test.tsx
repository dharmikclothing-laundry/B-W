import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import AdminIssuesScreen from './AdminIssuesScreen';
import AdminIssueDetailScreen from './AdminIssueDetailScreen';
import {approveAdminRefund, decideAdminClaim, getAdminIssueOrder, listAdminIssues, rejectAdminRefund, requestAdminRefund} from '../services/adminIssuesApi';

jest.mock('../services/adminIssuesApi', () => ({listAdminIssues: jest.fn(), getAdminIssueOrder: jest.fn(), decideAdminClaim: jest.fn(), requestAdminRefund: jest.fn(), approveAdminRefund: jest.fn(), rejectAdminRefund: jest.fn()}));
jest.mock('../services/claimsApi', () => ({deviceReachableUploadUrl: (url: string) => url}));
const queue = {claims: [{id: 'c1', order_id: 'o1', claim_type: 'damaged', description: 'Damaged shirt', status: 'submitted', created_at: ''}], refunds: [], cancellations: []};
const detail = {order: {id: 'o1', order_number: 'BW-001', current_status: 'delivered', total_amount: 100, payment_method: 'online'},
  claims: [{...queue.claims[0], customer_claim_photos: [{id: 'photo', storage_path: 'path', signedUrl: 'https://example.invalid/photo'}]}],
  payments: [{id: 'p1', order_id: 'o1', provider: 'mock', amount: 100, status: 'paid', refundableAmount: 90,
    refund_requests: [{id: 'r1', payment_order_id: 'p1', amount: 10, reason: 'Issue', status: 'requested', is_cancellation_refund: false, created_at: ''}]}],
  cancellationHistory: [], audit: []};
beforeEach(() => {jest.clearAllMocks(); (listAdminIssues as jest.Mock).mockResolvedValue(queue); (getAdminIssueOrder as jest.Mock).mockResolvedValue(detail);
  (decideAdminClaim as jest.Mock).mockResolvedValue({}); (requestAdminRefund as jest.Mock).mockResolvedValue({});
  (approveAdminRefund as jest.Mock).mockResolvedValue({}); (rejectAdminRefund as jest.Mock).mockResolvedValue({});});

test('claims queue opens the correct order and shows empty sections', async () => {
  const onOrder = jest.fn(); const view = await render(<AdminIssuesScreen accessToken="token" onBack={jest.fn()} onOrder={onOrder} />);
  await waitFor(() => expect(view.getByText('Damaged shirt')).toBeTruthy());
  expect(view.getByText('No refunds.')).toBeTruthy();
  fireEvent.press(view.getByText('Damaged shirt'));
  expect(onOrder).toHaveBeenCalledWith('o1');
});
test('queue error has retry', async () => {
  (listAdminIssues as jest.Mock).mockRejectedValueOnce(new Error('Network unavailable'));
  const view = await render(<AdminIssuesScreen accessToken="token" onBack={jest.fn()} onOrder={jest.fn()} />);
  await waitFor(() => expect(view.getByText('Network unavailable')).toBeTruthy());
  fireEvent.press(view.getByText('Retry issues'));
  await waitFor(() => expect(view.getByText('Damaged shirt')).toBeTruthy());
});
test('detail shows evidence, validates decision through API and refreshes after claim action', async () => {
  const view = await render(<AdminIssueDetailScreen accessToken="token" orderId="o1" onBack={jest.fn()} onOrder={jest.fn()} />);
  await waitFor(() => expect(view.getByText('Evidence: 1 photo(s)')).toBeTruthy());
  expect(view.getByLabelText('Claim evidence photo')).toBeTruthy();
  await fireEvent.changeText(view.getByLabelText('Admin decision notes'), 'Photo reviewed');
  await fireEvent.press(view.getByText('Start review'));
  await waitFor(() => expect(decideAdminClaim).toHaveBeenCalledWith('token', 'o1', 'c1', 'under_review', 'Photo reviewed'));
  await waitFor(() => expect(getAdminIssueOrder).toHaveBeenCalledTimes(2));
});
test('refund request, approval and rejection call scoped endpoints', async () => {
  const view = await render(<AdminIssueDetailScreen accessToken="token" orderId="o1" onBack={jest.fn()} onOrder={jest.fn()} />);
  await waitFor(() => expect(view.getByText('Available to refund: ₹90.00')).toBeTruthy());
  await fireEvent.changeText(view.getByLabelText('Admin decision notes'), 'Customer resolution');
  await fireEvent.changeText(view.getByLabelText('Refund amount for p1'), '20');
  await fireEvent.press(view.getByText('Request refund'));
  await waitFor(() => expect(requestAdminRefund).toHaveBeenCalledWith('token', 'o1', 'p1', 20, 'Customer resolution'));
  await fireEvent.changeText(view.getByLabelText('Admin decision notes'), 'Approved request');
  await fireEvent.press(view.getByText('Approve refund'));
  await waitFor(() => expect(approveAdminRefund).toHaveBeenCalledWith('token', 'o1', 'r1', 'Approved request'));
  await fireEvent.changeText(view.getByLabelText('Admin decision notes'), 'Rejected request');
  await fireEvent.press(view.getByText('Reject refund'));
  await waitFor(() => expect(rejectAdminRefund).toHaveBeenCalledWith('token', 'o1', 'r1', 'Rejected request'));
});
