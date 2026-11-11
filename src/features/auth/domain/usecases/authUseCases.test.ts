import { AppError } from '@/core/errors/AppError';
import { err, ok } from '@/core/result';
import { InMemorySessionRepository, TEST_USER, testSession, testTokens } from '@/testing/authFixtures';
import { ManualClock } from '@/testing/ManualClock';
import { createTestLogger } from '@/testing/testDependencies';

import { type AuthRepository } from '../AuthRepository';
import { LoginAttemptLimiter } from '../LoginAttemptLimiter';
import { SessionManager } from '../SessionManager';
import { FetchCurrentUser } from './FetchCurrentUser';
import { RegisterDemoAccount } from './RegisterDemoAccount';
import { RestoreSession, SESSION_READ_TIMEOUT_MS } from './RestoreSession';
import { SignIn } from './SignIn';
import { SignOut } from './SignOut';

const credentials = { username: 'emilys', password: 'emilyspass' };

function mockAuthRepository(overrides: Partial<jest.Mocked<AuthRepository>> = {}): jest.Mocked<AuthRepository> {
  return {
    login: jest.fn().mockResolvedValue(ok(testSession())),
    refresh: jest.fn().mockResolvedValue(ok(testTokens({ accessToken: 'access-2' }))),
    fetchCurrentUser: jest.fn().mockResolvedValue(ok(TEST_USER)),
    registerDemoAccount: jest.fn().mockResolvedValue(ok({ id: 209, firstName: 'Ada', username: 'ada' })),
    ...overrides,
  };
}

function setup(authRepository = mockAuthRepository(), stored: ReturnType<typeof testSession> | null = null) {
  const clock = new ManualClock(1_000_000);
  const logger = createTestLogger();
  const sessionRepository = new InMemorySessionRepository(stored);
  const sessionManager = new SessionManager({ authRepository, sessionRepository, clock, logger, skewMs: 0 });
  const limiter = new LoginAttemptLimiter({ maxAttempts: 3, lockoutMs: 30_000 });
  return { clock, logger, sessionRepository, sessionManager, limiter, authRepository };
}

describe('SignIn', () => {
  const signIn = (deps: ReturnType<typeof setup>) =>
    new SignIn(deps.authRepository, deps.sessionManager, deps.limiter, deps.clock, deps.logger);

  it('starts and persists the session on success', async () => {
    const deps = setup();

    await expect(signIn(deps).execute({ credentials })).resolves.toEqual(ok(TEST_USER));

    expect(deps.sessionManager.current?.user).toEqual(TEST_USER);
    expect(deps.sessionRepository.stored).not.toBeNull();
  });

  it('trims the username but never the password', async () => {
    const deps = setup();
    await signIn(deps).execute({ credentials: { username: '  emilys ', password: ' pass ' } });
    expect(deps.authRepository.login).toHaveBeenCalledWith({ username: 'emilys', password: ' pass ' }, undefined);
  });

  it('reports rejected credentials and pauses sign-in after repeated failures', async () => {
    const deps = setup(
      mockAuthRepository({ login: jest.fn().mockResolvedValue(err(new AppError('invalidCredentials', 'no'))) }),
    );
    const useCase = signIn(deps);

    await expect(useCase.execute({ credentials })).resolves.toEqual(
      err({ kind: 'invalidCredentials', lockedUntil: null }),
    );
    await useCase.execute({ credentials });
    const third = await useCase.execute({ credentials });
    expect(third).toEqual(err({ kind: 'invalidCredentials', lockedUntil: 1_030_000 }));

    // While paused, nothing is sent.
    await expect(useCase.execute({ credentials })).resolves.toEqual(
      err({ kind: 'rateLimited', lockedUntil: 1_030_000 }),
    );
    expect(deps.authRepository.login).toHaveBeenCalledTimes(3);

    deps.clock.advance(30_000);
    await useCase.execute({ credentials });
    expect(deps.authRepository.login).toHaveBeenCalledTimes(4);
  });

  it('does not count network failures towards the pause', async () => {
    const deps = setup(
      mockAuthRepository({ login: jest.fn().mockResolvedValue(err(new AppError('offline', 'offline'))) }),
    );
    const useCase = signIn(deps);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(useCase.execute({ credentials })).resolves.toEqual(err({ kind: 'offline', lockedUntil: null }));
    }
    expect(deps.authRepository.login).toHaveBeenCalledTimes(5);
  });

  it('does not call the server with blank credentials', async () => {
    const deps = setup();
    await expect(signIn(deps).execute({ credentials: { username: ' ', password: '' } })).resolves.toEqual(
      err({ kind: 'invalidCredentials', lockedUntil: null }),
    );
    expect(deps.authRepository.login).not.toHaveBeenCalled();
  });

  it('still signs in for this run when the session cannot be saved', async () => {
    const deps = setup();
    deps.sessionRepository.saveError = new AppError('storage', 'keychain locked');

    await expect(signIn(deps).execute({ credentials })).resolves.toEqual(ok(TEST_USER));
    expect(deps.logger.error).toHaveBeenCalled();
  });
});

describe('RestoreSession', () => {
  const restore = (deps: ReturnType<typeof setup>) =>
    new RestoreSession(deps.sessionRepository, deps.sessionManager, deps.logger);

  it('reports no session on first launch (missing token)', async () => {
    await expect(restore(setup()).execute()).resolves.toEqual({ kind: 'signedOut', reason: 'noSession' });
  });

  it('restores a valid session without a network round trip', async () => {
    const deps = setup(undefined, testSession());

    await expect(restore(deps).execute()).resolves.toEqual({ kind: 'signedIn', user: TEST_USER });
    expect(deps.authRepository.refresh).not.toHaveBeenCalled();
    expect(deps.sessionManager.current).not.toBeNull();
  });

  it('renews an expired access token during restore', async () => {
    const deps = setup(undefined, testSession({ accessTokenExpiresAt: 0 }));

    await expect(restore(deps).execute()).resolves.toEqual({ kind: 'signedIn', user: TEST_USER });
    expect(deps.sessionManager.current?.tokens.accessToken).toBe('access-2');
  });

  it('signs out with an explanation when the stored session can no longer be renewed', async () => {
    const authRepository = mockAuthRepository({
      refresh: jest.fn().mockResolvedValue(err(new AppError('sessionExpired', 'rejected'))),
    });
    const deps = setup(authRepository, testSession({ accessTokenExpiresAt: 0 }));

    await expect(restore(deps).execute()).resolves.toEqual({ kind: 'signedOut', reason: 'sessionExpired' });
    expect(deps.sessionRepository.stored).toBeNull();
  });

  it('stays signed in offline, keeping the session for a later renewal', async () => {
    const authRepository = mockAuthRepository({
      refresh: jest.fn().mockResolvedValue(err(new AppError('offline', 'x'))),
    });
    const deps = setup(authRepository, testSession({ accessTokenExpiresAt: 0 }));

    await expect(restore(deps).execute()).resolves.toEqual({ kind: 'signedIn', user: TEST_USER });
    expect(deps.sessionRepository.stored).not.toBeNull();
  });

  it('signs out when secure storage cannot be read', async () => {
    const deps = setup();
    deps.sessionRepository.loadError = new AppError('storage', 'keychain unavailable');
    await expect(restore(deps).execute()).resolves.toEqual({ kind: 'signedOut', reason: 'restoreFailed' });
  });

  it('does not hold the launch screen forever if storage hangs', async () => {
    jest.useFakeTimers();
    try {
      const deps = setup();
      deps.sessionRepository.load.mockImplementation(() => new Promise(() => undefined));
      const pending = restore(deps).execute();
      await jest.advanceTimersByTimeAsync(SESSION_READ_TIMEOUT_MS);
      await expect(pending).resolves.toEqual({ kind: 'signedOut', reason: 'restoreFailed' });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('SignOut', () => {
  it('clears the session from memory and storage', async () => {
    const deps = setup(undefined, testSession());
    deps.sessionManager.adopt(testSession());

    await new SignOut(deps.sessionManager, deps.logger).execute();

    expect(deps.sessionManager.current).toBeNull();
    expect(deps.sessionRepository.stored).toBeNull();
  });

  it('logs, but still signs out, when storage cannot be cleared', async () => {
    const deps = setup();
    deps.sessionManager.adopt(testSession());
    deps.sessionRepository.clearError = new AppError('storage', 'locked');

    await new SignOut(deps.sessionManager, deps.logger).execute();

    expect(deps.sessionManager.current).toBeNull();
    expect(deps.logger.error).toHaveBeenCalled();
  });
});

describe('FetchCurrentUser', () => {
  it('stores the fresh profile with the session', async () => {
    const deps = setup();
    deps.sessionManager.adopt(testSession());
    const fresh = { ...TEST_USER, firstName: 'Em' };
    deps.authRepository.fetchCurrentUser.mockResolvedValue(ok(fresh));

    await expect(new FetchCurrentUser(deps.authRepository, deps.sessionManager).execute()).resolves.toEqual(ok(fresh));
    expect(deps.sessionRepository.stored?.user).toEqual(fresh);
  });

  it('renews once and retries when the server rejects a token believed valid', async () => {
    const deps = setup();
    deps.sessionManager.adopt(testSession());
    deps.authRepository.fetchCurrentUser
      .mockResolvedValueOnce(err(new AppError('unauthorized', '401')))
      .mockResolvedValueOnce(ok(TEST_USER));

    await expect(new FetchCurrentUser(deps.authRepository, deps.sessionManager).execute()).resolves.toEqual(
      ok(TEST_USER),
    );
    expect(deps.authRepository.refresh).toHaveBeenCalledTimes(1);
    expect(deps.authRepository.fetchCurrentUser).toHaveBeenCalledTimes(2);
  });

  it('reports an expired session when renewal is refused', async () => {
    const deps = setup(
      mockAuthRepository({
        fetchCurrentUser: jest.fn().mockResolvedValue(err(new AppError('unauthorized', '401'))),
        refresh: jest.fn().mockResolvedValue(err(new AppError('sessionExpired', 'no'))),
      }),
    );
    deps.sessionManager.adopt(testSession());

    const result = await new FetchCurrentUser(deps.authRepository, deps.sessionManager).execute();

    expect(!result.ok && result.error.kind).toBe('sessionExpired');
  });

  it('sends nothing when signed out', async () => {
    const deps = setup();

    const result = await new FetchCurrentUser(deps.authRepository, deps.sessionManager).execute();

    expect(!result.ok && result.error.kind).toBe('sessionExpired');
    expect(deps.authRepository.fetchCurrentUser).not.toHaveBeenCalled();
  });

  it('sends nothing when renewing an expired token is refused', async () => {
    const deps = setup(
      mockAuthRepository({ refresh: jest.fn().mockResolvedValue(err(new AppError('forbidden', '403'))) }),
    );
    deps.sessionManager.adopt(testSession({ accessTokenExpiresAt: 0 }));

    const result = await new FetchCurrentUser(deps.authRepository, deps.sessionManager).execute();

    expect(!result.ok && result.error.kind).toBe('sessionExpired');
    expect(deps.authRepository.fetchCurrentUser).not.toHaveBeenCalled();
  });

  it('reports an expired session, without renewing, when the session ends while the request is in flight', async () => {
    const deps = setup();
    deps.sessionManager.adopt(testSession());
    deps.authRepository.fetchCurrentUser.mockImplementation(async () => {
      await deps.sessionManager.end();
      return err(new AppError('unauthorized', '401'));
    });

    const result = await new FetchCurrentUser(deps.authRepository, deps.sessionManager).execute();

    expect(!result.ok && result.error.kind).toBe('sessionExpired');
    expect(deps.authRepository.refresh).not.toHaveBeenCalled();
  });
});

describe('RegisterDemoAccount', () => {
  const details = {
    firstName: ' Ada ',
    lastName: 'Lovelace',
    email: 'ADA@example.com',
    username: 'ada',
    password: 'analytical',
  };

  it('sends normalised details', async () => {
    const repository = mockAuthRepository();
    await new RegisterDemoAccount(repository).execute({ details });
    expect(repository.registerDemoAccount).toHaveBeenCalledWith(
      { ...details, firstName: 'Ada', email: 'ada@example.com' },
      undefined,
    );
  });

  it('refuses invalid details without calling the server', async () => {
    const repository = mockAuthRepository();
    const result = await new RegisterDemoAccount(repository).execute({ details: { ...details, email: 'nope' } });
    expect(!result.ok && result.error.kind).toBe('badRequest');
    expect(repository.registerDemoAccount).not.toHaveBeenCalled();
  });
});
