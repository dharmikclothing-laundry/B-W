import {getDriverDashboard, getDriverJob, acceptDriverJob, rejectDriverJob, startDriverNavigation, markDriverArrived, beginFacilityTransit, getDriverHandoffQr, verifyDriverPickupOtp, publishDriverTripLocation, formatDriverAddress, lookupDriverOrder} from './driverAssignmentsApi';
import {apiRequest} from './api';

jest.mock('./api', () => ({apiRequest: jest.fn()}));
const request = apiRequest as jest.Mock;
beforeEach(() => {jest.clearAllMocks();});

test('dashboard and job detail use the existing authenticated request client', async () => {
  request.mockResolvedValue({});
  await getDriverDashboard('token');
  await getDriverJob('token', 'assignment-1');
  expect(request).toHaveBeenNthCalledWith(1, '/drivers/me/dashboard', {accessToken: 'token'});
  expect(request).toHaveBeenNthCalledWith(2, '/drivers/me/assignments/assignment-1', {accessToken: 'token'});
});

test('order lookup sends only the exact code to the Driver-scoped backend route', async () => {
  request.mockResolvedValue({assignmentId: 'assignment-1'});
  await lookupDriverOrder('token', ' BW-20260921-95FFAB54 ');
  expect(request).toHaveBeenCalledWith('/drivers/me/orders/lookup', {
    accessToken: 'token', method: 'POST', body: {code: 'BW-20260921-95FFAB54'},
  });
  await expect(lookupDriverOrder('token', '  ')).rejects.toThrow('Enter an order number');
});

test('address formatting handles missing data', () => {
  expect(formatDriverAddress(null)).toBe('Address unavailable');
  expect(formatDriverAddress({label: 'Home', address_line1: '1 Test Road', address_line2: null,
    city: 'Hyderabad', state: null, postal_code: null})).toBe('Home, 1 Test Road, Hyderabad');
});

test('trip navigation and GPS publication identify the exact assignment', async () => {
  request.mockResolvedValue({published: true});
  await startDriverNavigation('token', 'job-1');
  await publishDriverTripLocation('token', 'job-1', 17.4, 78.4, 8);
  expect(request).toHaveBeenNthCalledWith(1, '/driver-assignments/job-1/navigation', {accessToken: 'token', method: 'POST'});
  expect(request).toHaveBeenNthCalledWith(2, '/drivers/me/location', {accessToken: 'token', method: 'POST', body: {
    assignmentId: 'job-1', latitude: 17.4, longitude: 78.4, accuracyM: 8,
  }});
});

test('accept and reject use authenticated assignment actions with a required reason', async () => {
  request.mockResolvedValue({});
  await acceptDriverJob('token', 'assignment-1');
  await rejectDriverJob('token', 'assignment-1', '  Cannot reach address  ');
  expect(request).toHaveBeenNthCalledWith(1, '/driver-assignments/assignment-1/accept', {accessToken: 'token', method: 'POST'});
  expect(request).toHaveBeenNthCalledWith(2, '/driver-assignments/assignment-1/reject', {accessToken: 'token', method: 'POST', body: {reason: 'Cannot reach address'}});
  await expect(rejectDriverJob('token', 'assignment-1', '   ')).rejects.toThrow('reason is required');
  expect(request).toHaveBeenCalledTimes(2);
});

test('arrival and pickup OTP use only the existing authenticated backend contracts', async () => {
  request.mockResolvedValue({verified: true, orderStatus: 'picked_up'});
  await markDriverArrived('token', 'assignment-1');
  await verifyDriverPickupOtp('token', 'order-1', ' 123456 ');
  expect(request).toHaveBeenNthCalledWith(1, '/driver-assignments/assignment-1/arrive', {accessToken: 'token', method: 'POST'});
  expect(request).toHaveBeenNthCalledWith(2, '/orders/order-1/otp/verify', {accessToken: 'token', method: 'POST', body: {otpType: 'pickup', otp: '123456'}});
  await expect(verifyDriverPickupOtp('token', 'order-1', '12')).rejects.toThrow('six-digit pickup OTP');
  expect(request).toHaveBeenCalledTimes(2);
});

test('facility transit and handoff code are scoped to the authenticated assignment', async () => {
  request.mockResolvedValue({});
  await beginFacilityTransit('token', 'job-1');
  await getDriverHandoffQr('token', 'job-1');
  expect(request).toHaveBeenNthCalledWith(1, '/driver-assignments/job-1/facility-transit', {accessToken: 'token', method: 'POST'});
  expect(request).toHaveBeenNthCalledWith(2, '/drivers/me/assignments/job-1/handoff-qr', {accessToken: 'token'});
});
