export type ProviderSession = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in?: number;
  token_type?: string;
};

export type AuthSessionResponse = {
  session?: Partial<ProviderSession>;
  access_token?: string;
  refresh_token?: string;
  user?: {
    id?: string;
    phone?: string | null;
  };
  profile?: unknown;
  [key: string]: unknown;
};

export type StoredSession = {
  version: 1;
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
  phone: string | null;
  userId: string | null;
  profile: unknown;
};

export type SessionStatus =
  | 'hydrating'
  | 'authenticated'
  | 'unauthenticated';
