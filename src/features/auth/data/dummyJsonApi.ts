import { type ApiDefinition, type AuthStrategy } from '@/core/http';

const BASE_URL = 'https://dummyjson.com';

/** Short enough that expiry and renewal happen during normal use; DummyJSON's default is 60. */
export const ACCESS_TOKEN_LIFETIME_MINUTES = 30;

/** Unauthenticated endpoints: login, refresh, demo sign-up. POSTs are never retried, so a login is never sent twice. */
export const DUMMYJSON_PUBLIC_API: ApiDefinition = {
  name: 'dummyjson',
  baseUrl: BASE_URL,
  timeoutMs: 10_000,
};

/** Endpoints that need the signed-in user's bearer token (`/auth/me`). */
export function dummyJsonAuthorizedApi(auth: AuthStrategy): ApiDefinition {
  return { name: 'dummyjson-authorized', baseUrl: BASE_URL, timeoutMs: 10_000, auth };
}

/** Renewal runs while the launch screen is up, so it gets a tighter deadline than the API default. */
export const REFRESH_TIMEOUT_MS = 8000;
