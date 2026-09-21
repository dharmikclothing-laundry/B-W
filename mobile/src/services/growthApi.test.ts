import {apiRequest} from './api';
import {getActiveOffers, getLoyaltyInfo, getReferralInfo, validateCoupon} from './growthApi';

jest.mock('./api', () => ({apiRequest: jest.fn()}));
const request = apiRequest as jest.MockedFunction<typeof apiRequest>;
describe('growth API', () => {
  beforeEach(() => jest.clearAllMocks());
  it('reads current offers, referral history and the points ledger', async () => {
    request.mockResolvedValue([]);
    await getActiveOffers('token');
    await getReferralInfo('token');
    await getLoyaltyInfo('token');
    expect(request).toHaveBeenNthCalledWith(1, '/growth/offers', {accessToken: 'token'});
    expect(request).toHaveBeenNthCalledWith(2, '/growth/referral', {accessToken: 'token'});
    expect(request).toHaveBeenNthCalledWith(3, '/growth/loyalty', {accessToken: 'token'});
  });
  it('validates coupons through the authenticated server', async () => {
    request.mockResolvedValue({});
    await validateCoupon('token', ' SAVE10 ', 400);
    expect(request).toHaveBeenNthCalledWith(1, '/growth/coupon', {method: 'POST', accessToken: 'token', body: {code: 'SAVE10', orderAmount: 400}});
  });
});
