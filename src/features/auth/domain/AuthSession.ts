import { type AuthUser } from './AuthUser';

export interface AuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  /** Epoch milliseconds. */
  readonly accessTokenExpiresAt: number;
  /** Epoch milliseconds, or `null` when the provider doesn't say (the server then decides). */
  readonly refreshTokenExpiresAt: number | null;
}

export interface AuthSession {
  readonly user: AuthUser;
  readonly tokens: AuthTokens;
}

/**
 * Treat the access token as expired slightly early, so a request never leaves
 * with a token that expires in flight or is rejected because of clock drift.
 */
export const ACCESS_TOKEN_EXPIRY_SKEW_MS = 30_000;

export function isAccessTokenExpired(tokens: AuthTokens, now: number, skewMs = ACCESS_TOKEN_EXPIRY_SKEW_MS): boolean {
  return tokens.accessTokenExpiresAt - skewMs <= now;
}

export function isRefreshTokenExpired(tokens: AuthTokens, now: number): boolean {
  return tokens.refreshTokenExpiresAt !== null && tokens.refreshTokenExpiresAt <= now;
}
