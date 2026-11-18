import { type AppError } from '@/core/errors/AppError';
import { ApiError } from '@/core/http/ApiError';
import { err, ok, type Result } from '@/core/result';
import { type AuthSession, type AuthTokens } from '@/features/auth/domain/AuthSession';
import { type AuthUser } from '@/features/auth/domain/AuthUser';
import { type SessionRepository } from '@/features/auth/domain/SessionRepository';

import { apiFailure, apiSuccess, type FakeHttpClient, type FakeHttpClientFactory } from './FakeHttpClient';

/** Far enough ahead that a token never expires during a test (ManualClock starts at 0). */
export const FAR_FUTURE = 10 ** 13;

export const TEST_USER: AuthUser = {
  id: 1,
  username: 'emilys',
  email: 'emily.johnson@x.dummyjson.com',
  firstName: 'Emily',
  lastName: 'Johnson',
  imageUrl: 'https://dummyjson.com/icon/emilys/128',
};

/** An unsigned JWT whose payload carries `exp` (seconds), enough for the client's expiry reading. */
export function fakeJwt(expiresAtMs: number, subject = 'emilys'): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ username: subject, exp: Math.floor(expiresAtMs / 1000) })}.signature`;
}

export function testTokens(overrides: Partial<AuthTokens> = {}): AuthTokens {
  return {
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    accessTokenExpiresAt: FAR_FUTURE,
    refreshTokenExpiresAt: null,
    ...overrides,
  };
}

export function testSession(tokens: Partial<AuthTokens> = {}, user: AuthUser = TEST_USER): AuthSession {
  return { user, tokens: testTokens(tokens) };
}

/** DummyJSON's `POST /auth/login` body for {@link TEST_USER}. */
export function loginResponseDto(accessExpiresAt = FAR_FUTURE, refreshExpiresAt = FAR_FUTURE) {
  return {
    id: TEST_USER.id,
    username: TEST_USER.username,
    email: TEST_USER.email,
    firstName: TEST_USER.firstName,
    lastName: TEST_USER.lastName,
    gender: 'female',
    image: TEST_USER.imageUrl,
    accessToken: fakeJwt(accessExpiresAt),
    refreshToken: fakeJwt(refreshExpiresAt),
  };
}

export const httpError = (status: number, kind: AppError['kind'] = 'badRequest') =>
  apiFailure(new ApiError(kind, `Request failed with status ${status}`, { status }));

/**
 * Scripts the DummyJSON endpoints on a {@link FakeHttpClientFactory}. Defaults:
 * the demo credentials sign in, refresh succeeds, `/auth/me` returns the test user.
 */
export function stubDummyJson(factory: FakeHttpClientFactory) {
  const publicApi: FakeHttpClient = factory.client('dummyjson');
  const authorizedApi: FakeHttpClient = factory.client('dummyjson-authorized');

  publicApi.on('POST', '/auth/login', (request) => {
    const body = request.body as { username?: string; password?: string };
    return body.username === 'emilys' && body.password === 'emilyspass'
      ? apiSuccess(loginResponseDto())
      : httpError(400);
  });
  publicApi.on('POST', '/auth/refresh', apiSuccess({ accessToken: fakeJwt(FAR_FUTURE), refreshToken: 'refresh-2' }));
  publicApi.on('POST', '/users/add', (request) => {
    const body = request.body as { firstName: string; username: string };
    return apiSuccess({ id: 209, firstName: body.firstName, username: body.username });
  });
  authorizedApi.on('GET', '/auth/me', apiSuccess({ ...loginResponseDto(), firstName: 'Emily R.' }));

  return { publicApi, authorizedApi };
}

/** Stateful SessionRepository with switchable failures; methods are jest spies. */
export class InMemorySessionRepository implements SessionRepository {
  stored: AuthSession | null;
  loadError: AppError | null = null;
  saveError: AppError | null = null;
  clearError: AppError | null = null;

  constructor(initial: AuthSession | null = null) {
    this.stored = initial;
  }

  readonly load = jest.fn(async (): Promise<Result<AuthSession | null, AppError>> => {
    return this.loadError ? err(this.loadError) : ok(this.stored);
  });

  readonly save = jest.fn(async (session: AuthSession): Promise<Result<void, AppError>> => {
    if (this.saveError) return err(this.saveError);
    this.stored = session;
    return ok(undefined);
  });

  readonly clear = jest.fn(async (): Promise<Result<void, AppError>> => {
    if (this.clearError) return err(this.clearError);
    this.stored = null;
    return ok(undefined);
  });
}
