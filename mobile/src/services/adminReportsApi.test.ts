import {getAdminAudit, getAdminReport} from './adminReportsApi';
import {apiRequest} from './api';
jest.mock('./api', () => ({apiRequest: jest.fn()}));
const request = apiRequest as jest.Mock;
test('uses authenticated, encoded read-only report and audit endpoints', async () => {
  request.mockResolvedValue({events: []});
  await getAdminReport('admin-token', {from: '2026-09-01', to: '2026-09-20'});
  await getAdminAudit('admin-token', {from: '2026-09-01', to: '2026-09-20', source: 'staff', q: 'price & tax', limit: 50, offset: 50});
  expect(request.mock.calls[0]).toEqual(['/admin/analytics/report?from=2026-09-01&to=2026-09-20', {accessToken: 'admin-token'}]);
  expect(request.mock.calls[1][0]).toContain('q=price+%26+tax');
  expect(request.mock.calls[1][0]).toContain('offset=50');
  expect(request.mock.calls[1][1]).toEqual({accessToken: 'admin-token'});
});
