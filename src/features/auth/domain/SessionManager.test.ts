import { AppError } from '@/core/errors/AppError';
import { err, ok, type Result } from '@/core/result';
import { InMemorySessionRepository, testSession, testTokens } from '@/testing/authFixtures';
import { ManualClock } from '@/testing/ManualClock';
import { createTestLogger } from '@/testing/testDependencies';

import { type AuthTokens } from './AuthSession';
import { SessionManager } from './SessionManager';

const RENEWED = testTokens({ accessToken: 'access-2', refreshToken: 'refresh-2', accessTokenExpiresAt: 3_600_000 });

function setup(
  refresh: jest.Mock<Promise<Result<AuthTokens, AppError>>, [string]> = jest.fn().mockResolvedValue(ok(RENEWED)),
) {
  const clock = new ManualClock(1_000_000);
  const sessionRepository = new InMemorySessionRepository();
  const logger = createTestLogger();
  const manager = new SessionManager({ authRepository: { refresh }, sessionRepository, clock, logger, skewMs: 0 });
  return { manager, refresh, clock, sessionRepository, logger };
}

const expiredSession = () => testSession({ accessTokenExpiresAt: 500_000 });

describe('SessionManager', () => {
  it('starts a session and persists it', async () => {
    const { manager, sessionRepository } = setup();
    const session = testSession();

    await expect(manager.start(session)).resolves.toEqual(ok(undefined));

    expect(manager.current).toBe(session);
    expect(sessionRepository.stored).toEqual(session);
  });

  it('hands out a still-valid token without calling the server', async () => {
    const { manager, refresh } = setup();
    manager.adopt(testSession());

    await expect(manager.getValidAccessToken()).resolves.toBe('access-1');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('returns null when signed out', async () => {
    const { manager } = setup();
    await expect(manager.getValidAccessToken()).resolves.toBeNull();
  });

  it('renews an expired access token before handing it out, and persists the renewal', async () => {
    const { manager, refresh, sessionRepository } = setup();
    manager.adopt(expiredSession());

    await expect(manager.getValidAccessToken()).resolves.toBe('access-2');

    expect(refresh).toHaveBeenCalledWith('refresh-1');
    expect(sessionRepository.stored?.tokens).toEqual(RENEWED);
  });

  it('treats a token inside the safety margin as expired', async () => {
    const refresh = jest.fn().mockResolvedValue(ok(RENEWED));
    const clock = new ManualClock(1_000_000);
    const manager = new SessionManager({
      authRepository: { refresh },
      sessionRepository: new InMemorySessionRepository(),
      clock,
      logger: createTestLogger(),
      skewMs: 30_000,
    });
    manager.adopt(testSession({ accessTokenExpiresAt: 1_020_000 }));

    await manager.getValidAccessToken();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('shares one refresh request between concurrent callers', async () => {
    let resolve: (result: Result<AuthTokens, AppError>) => void = () => undefined;
    const refresh = jest.fn((_token: string) => new Promise<Result<AuthTokens, AppError>>((r) => (resolve = r)));
    const { manager } = setup(refresh);
    manager.adopt(expiredSession());

    const tokens = Promise.all([manager.getValidAccessToken(), manager.getValidAccessToken(), manager.refresh()]);
    resolve(ok(RENEWED));
    const [first, second] = await tokens;

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(first).toBe('access-2');
    expect(second).toBe('access-2');
  });

  it('ends the session and notifies listeners when the server refuses to renew it', async () => {
    const { manager, sessionRepository } = setup(
      jest.fn().mockResolvedValue(err(new AppError('sessionExpired', 'no'))),
    );
    sessionRepository.stored = expiredSession();
    manager.adopt(expiredSession());
    const onExpired = jest.fn();
    manager.onExpired(onExpired);

    await expect(manager.getValidAccessToken()).resolves.toBeNull();

    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(manager.current).toBeNull();
    expect(sessionRepository.stored).toBeNull();
  });

  it('expires without a request when the refresh token itself has expired', async () => {
    const { manager, refresh } = setup();
    manager.adopt(testSession({ accessTokenExpiresAt: 500_000, refreshTokenExpiresAt: 900_000 }));
    const onExpired = jest.fn();
    manager.onExpired(onExpired);

    await expect(manager.refresh()).resolves.toEqual({ kind: 'expired' });
    expect(refresh).not.toHaveBeenCalled();
    expect(onExpired).toHaveBeenCalled();
  });

  it('keeps the session when renewal is impossible right now (offline)', async () => {
    const offline = new AppError('offline', 'offline');
    const { manager } = setup(jest.fn().mockResolvedValue(err(offline)));
    manager.adopt(expiredSession());
    const onExpired = jest.fn();
    manager.onExpired(onExpired);

    await expect(manager.refresh()).resolves.toEqual({ kind: 'unavailable', error: offline });
    // The stale token goes out so the request fails as "offline", not as "signed out".
    await expect(manager.getValidAccessToken()).resolves.toBe('access-1');
    expect(manager.current).not.toBeNull();
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('discards a renewal that completes after sign-out', async () => {
    let resolve: (result: Result<AuthTokens, AppError>) => void = () => undefined;
    const { manager, sessionRepository } = setup(
      jest.fn((_token: string) => new Promise<Result<AuthTokens, AppError>>((r) => (resolve = r))),
    );
    manager.adopt(expiredSession());

    const pending = manager.refresh();
    await manager.end();
    resolve(ok(RENEWED));

    await expect(pending).resolves.toEqual({ kind: 'expired' });
    expect(manager.current).toBeNull();
    expect(sessionRepository.save).not.toHaveBeenCalled();
  });

  it('retries clearing storage once when ending a session', async () => {
    const { manager, sessionRepository } = setup();
    sessionRepository.clear.mockResolvedValueOnce(err(new AppError('storage', 'locked')));

    await expect(manager.end()).resolves.toEqual(ok(undefined));
    expect(sessionRepository.clear).toHaveBeenCalledTimes(2);
  });

  it('can simulate expiry for manual testing', async () => {
    const { manager, refresh } = setup();
    manager.adopt(testSession());

    manager.simulateExpiry('session');
    await manager.getValidAccessToken();

    expect(refresh).toHaveBeenCalledWith('invalidated-for-testing');
  });
});
