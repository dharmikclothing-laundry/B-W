import {getCustomerProfile, updateCustomerName, validateName} from './profileApi';
import {apiRequest} from './api';
jest.mock('./api', () => ({apiRequest: jest.fn()}));
const request = apiRequest as jest.Mock;
test('name validation rejects blank, short and numeric names', () => {
  expect(validateName(' ')).toBeTruthy(); expect(validateName('A')).toBeTruthy(); expect(validateName('123')).toBeTruthy();
  expect(validateName('Asha Reddy')).toBeNull();
});
test('profile read and name update use owned customer endpoints', async () => {
  request.mockResolvedValue({id: 'profile'});
  await getCustomerProfile('token'); await updateCustomerName('token', ' Asha Reddy ');
  expect(request).toHaveBeenNthCalledWith(1, '/customers/me', {accessToken: 'token'});
  expect(request).toHaveBeenNthCalledWith(2, '/customers/me', {method: 'PATCH', accessToken: 'token', body: {fullName: 'Asha Reddy'}});
  await expect(updateCustomerName('token', '1')).rejects.toThrow();
});
