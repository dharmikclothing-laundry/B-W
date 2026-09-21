import {apiRequest} from './api';
import type {AuthSessionResponse} from '../types/session';

type RequestOtpResponse = {
  success?: boolean;
  message?: string;
};

export type VerifyOtpResponse =
  AuthSessionResponse;

export async function requestPhoneOtp(
  phone: string,
): Promise<RequestOtpResponse> {
  return apiRequest<RequestOtpResponse>(
    '/auth/phone/request-otp',
    {
      method: 'POST',
      body: {
        phone,
      },
    },
  );
}

export async function verifyPhoneOtp(
  phone: string,
  token: string,
): Promise<VerifyOtpResponse> {
  return apiRequest<VerifyOtpResponse>(
    '/auth/phone/verify-otp',
    {
      method: 'POST',
      body: {
        phone,
        token,
      },
    },
  );
}

export async function getMyProfile(
  accessToken: string,
): Promise<unknown> {
  return apiRequest<unknown>(
    '/auth/me',
    {
      accessToken,
    },
  );
}

export async function refreshPhoneSession(
  refreshToken: string,
): Promise<AuthSessionResponse> {
  return apiRequest<AuthSessionResponse>(
    '/auth/refresh',
    {
      method: 'POST',
      body: {refreshToken},
      retryAuthentication: false,
    },
  );
}

export function getAccessTokenFromVerification(
  response: VerifyOtpResponse,
): string | null {
  return (
    response.session?.access_token ??
    response.access_token ??
    null
  );
}
