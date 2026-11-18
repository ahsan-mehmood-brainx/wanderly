import { AppError } from '@/core/errors/AppError';
import { type ApiError, type HttpClient } from '@/core/http';
import { err, ok, type Result } from '@/core/result';
import { type Clock } from '@/core/utils/Clock';

import { type AuthRepository, type RegisteredAccount } from '../domain/AuthRepository';
import { type AuthTokens, type AuthSession } from '../domain/AuthSession';
import { type AuthUser } from '../domain/AuthUser';
import { type Credentials, type RegistrationDetails } from '../domain/Credentials';
import { toAuthSession, toAuthTokens, toAuthUser } from './authMappers';
import { addUserResponseDtoSchema, loginResponseDtoSchema, tokenPairDtoSchema, userDtoSchema } from './dto/authDtos';
import { ACCESS_TOKEN_LIFETIME_MINUTES, REFRESH_TIMEOUT_MS } from './dummyJsonApi';

export interface DummyJsonAuthRepositoryDependencies {
  /** Client without credentials, for login, refresh and sign-up. */
  readonly publicHttp: HttpClient;
  /** Client whose auth strategy attaches the current access token. */
  readonly authorizedHttp: HttpClient;
  readonly clock: Clock;
  readonly accessTokenLifetimeMinutes?: number;
}

/** DummyJSON answers 400 for a wrong password (and for missing fields) and 401 on some deployments. */
const isRejectedLogin = (error: ApiError) => error.status === 400 || error.status === 401;
/** 401/403 for an expired or invalid refresh token, 400 when it's missing. */
const isRejectedRefresh = (error: ApiError) => error.status === 400 || error.status === 401 || error.status === 403;

/**
 * DummyJSON-backed authentication (https://dummyjson.com/docs/auth).
 *
 * Tokens travel in request bodies and the `Authorization` header only. DummyJSON
 * also sets auth cookies, but the HTTP client never sends credentials
 * (`withCredentials` is off), so the native cookie jar never holds a copy of them.
 */
export class DummyJsonAuthRepository implements AuthRepository {
  private readonly lifetimeMinutes: number;

  constructor(private readonly deps: DummyJsonAuthRepositoryDependencies) {
    this.lifetimeMinutes = deps.accessTokenLifetimeMinutes ?? ACCESS_TOKEN_LIFETIME_MINUTES;
  }

  private get lifetimeMs(): number {
    return this.lifetimeMinutes * 60_000;
  }

  async login({ username, password }: Credentials, signal?: AbortSignal): Promise<Result<AuthSession, AppError>> {
    const requestedAt = this.deps.clock.now();
    const result = await this.deps.publicHttp.post(
      '/auth/login',
      { username, password, expiresInMins: this.lifetimeMinutes },
      { schema: loginResponseDtoSchema, signal },
    );

    if (!result.ok) {
      if (!isRejectedLogin(result.error)) return err(result.error);
      return err(new AppError('invalidCredentials', 'The username or password was rejected', { cause: result.error }));
    }
    return ok(toAuthSession(result.value.data, requestedAt, this.lifetimeMs));
  }

  async refresh(refreshToken: string, signal?: AbortSignal): Promise<Result<AuthTokens, AppError>> {
    const requestedAt = this.deps.clock.now();
    const result = await this.deps.publicHttp.post(
      '/auth/refresh',
      { refreshToken, expiresInMins: this.lifetimeMinutes },
      { schema: tokenPairDtoSchema, signal, timeoutMs: REFRESH_TIMEOUT_MS },
    );

    if (!result.ok) {
      if (!isRejectedRefresh(result.error)) return err(result.error);
      return err(new AppError('sessionExpired', 'The refresh token was rejected', { cause: result.error }));
    }
    return ok(toAuthTokens(result.value.data, requestedAt, this.lifetimeMs));
  }

  async fetchCurrentUser(signal?: AbortSignal): Promise<Result<AuthUser, AppError>> {
    const result = await this.deps.authorizedHttp.get('/auth/me', { schema: userDtoSchema, signal });
    return result.ok ? ok(toAuthUser(result.value.data)) : err(result.error);
  }

  async registerDemoAccount(
    { firstName, lastName, email, username }: RegistrationDetails,
    signal?: AbortSignal,
  ): Promise<Result<RegisteredAccount, AppError>> {
    // The password is deliberately not sent: the demo backend discards accounts anyway,
    // so there is no reason for a password the user typed to leave the device.
    const result = await this.deps.publicHttp.post(
      '/users/add',
      { firstName, lastName, email, username },
      { schema: addUserResponseDtoSchema, signal },
    );
    return result.ok ? ok(result.value.data) : err(result.error);
  }
}
