export const RATE_LIMITS = {
  public: { ttl: 60_000, limit: 60 },
  authenticated: { ttl: 60_000, limit: 120 },
  otp: { ttl: 15 * 60_000, limit: 5 },
  payments: { ttl: 60_000, limit: 20 },
};
