import { type AppError } from '@/core/errors/AppError';
import { type Result } from '@/core/result';

import { type AuthSession, type AuthTokens } from './AuthSession';
import { type AuthUser } from './AuthUser';
import { type Credentials, type RegistrationDetails } from './Credentials';

/** What the demo backend echoes back for a simulated sign-up. Nothing is stored server-side. */
export interface RegisteredAccount {
  readonly id: number;
  readonly firstName: string;
  readonly username: string;
}

/** Remote authentication operations. Implementations map transport failures into the AppError taxonomy. */
export interface AuthRepository {
  /** Fails with `invalidCredentials` when the server rejects the username/password. */
  login(credentials: Credentials, signal?: AbortSignal): Promise<Result<AuthSession, AppError>>;
  /** Fails with `sessionExpired` when the refresh token is no longer accepted. */
  refresh(refreshToken: string, signal?: AbortSignal): Promise<Result<AuthTokens, AppError>>;
  /** Uses the current session's access token. Fails with `unauthorized` if the server rejects it. */
  fetchCurrentUser(signal?: AbortSignal): Promise<Result<AuthUser, AppError>>;
  /** Simulated sign-up: the backend validates and echoes the details but never persists them. */
  registerDemoAccount(details: RegistrationDetails, signal?: AbortSignal): Promise<Result<RegisteredAccount, AppError>>;
}
