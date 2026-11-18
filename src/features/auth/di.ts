import { type CoreDependencies } from '@/core/di/CoreDependencies';
import { type Factories } from '@/core/di/createContainer';
import { type AppError } from '@/core/errors/AppError';
import { BearerTokenAuth } from '@/core/http';
import { type Result } from '@/core/result';
import { type UseCase } from '@/core/usecase/UseCase';

import { DummyJsonAuthRepository } from './data/DummyJsonAuthRepository';
import { DUMMYJSON_PUBLIC_API, dummyJsonAuthorizedApi } from './data/dummyJsonApi';
import { SecureSessionRepository } from './data/SecureSessionRepository';
import { type AuthRepository, type RegisteredAccount } from './domain/AuthRepository';
import { type AuthUser } from './domain/AuthUser';
import { LoginAttemptLimiter } from './domain/LoginAttemptLimiter';
import { SessionManager } from './domain/SessionManager';
import { type SessionRepository } from './domain/SessionRepository';
import { FetchCurrentUser, type FetchCurrentUserInput } from './domain/usecases/FetchCurrentUser';
import { RegisterDemoAccount, type RegisterDemoAccountInput } from './domain/usecases/RegisterDemoAccount';
import { RestoreSession, type RestoreOutcome } from './domain/usecases/RestoreSession';
import { SignIn, type SignInFailure, type SignInInput } from './domain/usecases/SignIn';
import { SignOut } from './domain/usecases/SignOut';

export interface AuthDependencies {
  readonly authRepository: AuthRepository;
  readonly sessionRepository: SessionRepository;
  readonly sessionManager: SessionManager;
  readonly loginAttemptLimiter: LoginAttemptLimiter;
  readonly signIn: UseCase<SignInInput, Result<AuthUser, SignInFailure>>;
  readonly signOut: UseCase<void, void>;
  readonly restoreSession: UseCase<void, RestoreOutcome>;
  readonly fetchCurrentUser: UseCase<FetchCurrentUserInput, Result<AuthUser, AppError>>;
  readonly registerDemoAccount: UseCase<RegisterDemoAccountInput, Result<RegisteredAccount, AppError>>;
}

/**
 * The authorized client reads the token through a closure, at request time. That
 * keeps the graph acyclic (the session manager needs the repository to refresh, and
 * the repository's client needs the manager for tokens) and means a renewed token is
 * picked up without rebuilding the client.
 */
export const authFactories: Factories<AuthDependencies, CoreDependencies & AuthDependencies> = {
  authRepository: (c) =>
    new DummyJsonAuthRepository({
      publicHttp: c.httpClientFactory.create(DUMMYJSON_PUBLIC_API),
      authorizedHttp: c.httpClientFactory.create(
        dummyJsonAuthorizedApi(new BearerTokenAuth(() => c.sessionManager.getValidAccessToken())),
      ),
      clock: c.clock,
    }),
  sessionRepository: (c) =>
    new SecureSessionRepository(c.secureStore, c.keyValueStore, c.logger.child({ scope: 'session' })),
  sessionManager: (c) =>
    new SessionManager({
      authRepository: c.authRepository,
      sessionRepository: c.sessionRepository,
      clock: c.clock,
      logger: c.logger.child({ scope: 'session' }),
    }),
  loginAttemptLimiter: () => new LoginAttemptLimiter(),
  signIn: (c) => new SignIn(c.authRepository, c.sessionManager, c.loginAttemptLimiter, c.clock, c.logger),
  signOut: (c) => new SignOut(c.sessionManager, c.logger),
  restoreSession: (c) => new RestoreSession(c.sessionRepository, c.sessionManager, c.logger),
  fetchCurrentUser: (c) => new FetchCurrentUser(c.authRepository, c.sessionManager),
  registerDemoAccount: (c) => new RegisterDemoAccount(c.authRepository),
};
