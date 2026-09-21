import {apiRequest} from './api';
import {getServices} from './servicesApi';
jest.mock('./api', () => ({apiRequest: jest.fn()}));
test('loads the active catalogue returned by the server contract', async () => {const result = [{id: '1', categoryId: 'c', categoryName: 'Wash & Fold', name: 'Wash & Fold', description: null, pricingUnit: 'kg', price: 89, facilityId: null}]; (apiRequest as jest.Mock).mockResolvedValue(result); await expect(getServices('token')).resolves.toEqual(result); expect(apiRequest).toHaveBeenCalledWith('/services', {accessToken: 'token'});});
test('rejects malformed catalogue responses instead of hard-coding fallback items', async () => {(apiRequest as jest.Mock).mockResolvedValue({items: []}); await expect(getServices('token')).rejects.toThrow('Invalid services response');});
