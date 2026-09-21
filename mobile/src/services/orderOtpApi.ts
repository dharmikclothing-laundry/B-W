import {apiRequest} from './api';

export type CustomerOtpType =
  | 'pickup'
  | 'delivery';

export type CustomerOrderOtp = {
  otpId: string;
  otp: string;
  otpType: CustomerOtpType;
  expiresAt: string;
  delivery: 'local_mock';
};

export function getCustomerOtpTypeForStatus(
  status: string,
): CustomerOtpType | null {
  if (status === 'pickup_otp_pending') {
    return 'pickup';
  }

  if (status === 'delivery_otp_pending') {
    return 'delivery';
  }

  return null;
}

export async function createCustomerOrderOtp(
  accessToken: string,
  orderId: string,
  otpType: CustomerOtpType,
): Promise<CustomerOrderOtp> {
  const response =
    await apiRequest<CustomerOrderOtp>(
      `/orders/${orderId}/otp`,
      {
        method: 'POST',
        accessToken,
        body: {otpType},
      },
    );

  if (
    !response.otpId ||
    !/^\d{6}$/.test(response.otp) ||
    response.otpType !== otpType ||
    !response.expiresAt
  ) {
    throw new Error(
      'Unable to retrieve your OTP. Please try again.',
    );
  }

  return response;
}
