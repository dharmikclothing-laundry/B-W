import {
  createCustomerOrderOtp,
  getCustomerOtpTypeForStatus,
} from './orderOtpApi';
import {apiRequest} from './api';

jest.mock('./api', () => ({
  apiRequest: jest.fn(),
}));

const mockedApiRequest =
  apiRequest as jest.MockedFunction<
    typeof apiRequest
  >;

describe('customer order OTP flow', () => {
  it('shows only the OTP that matches the ready order state', () => {
    expect(
      getCustomerOtpTypeForStatus(
        'pickup_otp_pending',
      ),
    ).toBe('pickup');
    expect(
      getCustomerOtpTypeForStatus(
        'delivery_otp_pending',
      ),
    ).toBe('delivery');
    expect(
      getCustomerOtpTypeForStatus(
        'picked_up',
      ),
    ).toBeNull();
  });

  it('returns a valid local OTP for the matching customer state', async () => {
    mockedApiRequest.mockResolvedValueOnce({
      otpId: 'otp-1',
      otp: '123456',
      otpType: 'pickup',
      expiresAt: '2026-09-18T12:00:00.000Z',
      delivery: 'local_mock',
    });

    await expect(
      createCustomerOrderOtp(
        'token',
        'order-1',
        'pickup',
      ),
    ).resolves.toMatchObject({
      otp: '123456',
      otpType: 'pickup',
    });
  });

  it('turns an incomplete OTP response into a customer-visible error', async () => {
    mockedApiRequest.mockResolvedValueOnce({
      otpId: 'otp-1',
      otp: '',
      otpType: 'pickup',
      expiresAt: '2026-09-18T12:00:00.000Z',
      delivery: 'local_mock',
    });

    await expect(
      createCustomerOrderOtp(
        'token',
        'order-1',
        'pickup',
      ),
    ).rejects.toThrow(
      'Unable to retrieve your OTP',
    );
  });
});
