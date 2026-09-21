import {getDriverJob} from './driverAssignmentsApi';
import {openDriverNotification} from './driverNotifications';
import {markNotificationRead} from './notificationsApi';

jest.mock('./driverAssignmentsApi', () => ({getDriverJob: jest.fn()}));
jest.mock('./notificationsApi', () => ({markNotificationRead: jest.fn()}));
const owned = {id: 'assignment-1', type: 'pickup', assignmentStatus: 'assigned', orderStatus: 'pickup_assigned'};
const item = {id: 'notification-1', data: {assignmentId: 'assignment-1'}, is_read: false} as any;
beforeEach(() => {jest.clearAllMocks(); (getDriverJob as jest.Mock).mockResolvedValue(owned); (markNotificationRead as jest.Mock).mockResolvedValue({});});

test('opens only a current assignment validated by the Driver endpoint', async () => {
  const navigate = jest.fn();
  await openDriverNotification('session', 'driver', item, navigate);
  expect(getDriverJob).toHaveBeenCalledWith('session', 'assignment-1');
  expect(markNotificationRead).toHaveBeenCalledWith('session', 'notification-1');
  expect(navigate).toHaveBeenCalledWith('assignment-1');
});

test('blocks unauthenticated and non-Driver navigation before fetching the job', async () => {
  const navigate = jest.fn();
  await expect(openDriverNotification(null, 'driver', item, navigate)).rejects.toThrow('Sign in as a Driver');
  await expect(openDriverNotification('session', 'customer', item, navigate)).rejects.toThrow('Sign in as a Driver');
  expect(getDriverJob).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled();
});

test('wrong Driver and missing assignment payload cannot navigate', async () => {
  const navigate = jest.fn();
  (getDriverJob as jest.Mock).mockRejectedValueOnce(new Error('Not found'));
  await expect(openDriverNotification('session', 'driver', item, navigate)).rejects.toThrow('no longer assigned');
  await expect(openDriverNotification('session', 'driver', {...item, data: {}}, navigate)).rejects.toThrow('no Driver assignment');
  await expect(openDriverNotification('session', 'driver', {...item, data: {assignmentId: 3}}, navigate)).rejects.toThrow('no Driver assignment');
  expect(navigate).not.toHaveBeenCalled(); expect(markNotificationRead).not.toHaveBeenCalled();
});

test('stale and completed assignments remain closed', async () => {
  const navigate = jest.fn();
  (getDriverJob as jest.Mock).mockResolvedValueOnce({...owned, assignmentStatus: 'completed'})
    .mockResolvedValueOnce({...owned, orderStatus: 'cancelled'});
  await expect(openDriverNotification('session', 'driver', item, navigate)).rejects.toThrow('no longer active');
  await expect(openDriverNotification('session', 'driver', item, navigate)).rejects.toThrow('no longer active');
  expect(navigate).not.toHaveBeenCalled(); expect(markNotificationRead).not.toHaveBeenCalled();
});

test('restored Driver session uses its current token and opens the job', async () => {
  const navigate = jest.fn();
  await openDriverNotification('restored-token', 'driver', {...item, is_read: true}, navigate);
  expect(getDriverJob).toHaveBeenCalledWith('restored-token', 'assignment-1');
  expect(markNotificationRead).not.toHaveBeenCalled();
  expect(navigate).toHaveBeenCalledWith('assignment-1');
});

test('read-receipt failure does not block a validated assigned job', async () => {
  (markNotificationRead as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  const navigate = jest.fn();
  await openDriverNotification('session', 'driver', item, navigate);
  expect(navigate).toHaveBeenCalledWith('assignment-1');
});
