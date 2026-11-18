import { AxiosHttpClientFactory, BearerTokenAuth, noRetry } from '@/core/http';
import { ok } from '@/core/result';
import {
  FAR_FUTURE,
  fakeJwt,
  httpError,
  loginResponseDto,
  stubDummyJson,
  testSession,
  TEST_USER,
} from '@/testing/authFixtures';
import { FakeConnectivityService } from '@/testing/FakeConnectivityService';
import { apiSuccess, FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { InMemoryKeyValueStore } from '@/testing/InMemoryKeyValueStore';
import { ManualClock, sequentialIds } from '@/testing/ManualClock';
import { createMockAxiosAdapter } from '@/testing/mockAxiosAdapter';
import { createTestLogger } from '@/testing/testDependencies';

import { DummyJsonAuthRepository } from './DummyJsonAuthRepository';
import { DUMMYJSON_PUBLIC_API, dummyJsonAuthorizedApi } from './dummyJsonApi';
import { readJwtExpiry } from './jwt';
import { SESSION_MARKER_KEY, SESSION_SECURE_KEY, SecureSessionRepository } from './SecureSessionRepository';

function setupRepository() {
  const factory = new FakeHttpClientFactory();
  const stubs = stubDummyJson(factory);
  const clock = new ManualClock(1_000_000);
  const repository = new DummyJsonAuthRepository({
    publicHttp: factory.create(DUMMYJSON_PUBLIC_API),
    authorizedHttp: factory.create(dummyJsonAuthorizedApi(new BearerTokenAuth(() => 'token'))),
    clock,
  });
  return { repository, ...stubs };
}

describe('readJwtExpiry', () => {
  it('reads exp as milliseconds', () => {
    expect(readJwtExpiry(fakeJwt(1_794_341_434_000))).toBe(1_794_341_434_000);
  });

  it('returns null for anything that is not a readable JWT', () => {
    expect(readJwtExpiry('opaque-token')).toBeNull();
    expect(readJwtExpiry('a.!!!.c')).toBeNull();
    expect(readJwtExpiry(`a.${btoa('{"sub":1}')}.c`)).toBeNull();
  });
});

describe('DummyJsonAuthRepository', () => {
  it('logs in and maps the response to a session, reading expiry from the tokens', async () => {
    const { repository, publicApi } = setupRepository();

    const result = await repository.login({ username: 'emilys', password: 'emilyspass' });

    expect(result.ok && result.value.user).toEqual(TEST_USER);
    expect(result.ok && result.value.tokens.accessTokenExpiresAt).toBe(Math.floor(FAR_FUTURE / 1000) * 1000);
    expect(publicApi.requests[0]?.body).toEqual({ username: 'emilys', password: 'emilyspass', expiresInMins: 30 });
  });

  it('falls back to the requested lifetime when a token has no readable expiry', async () => {
    const { repository, publicApi } = setupRepository();
    publicApi.on('POST', '/auth/login', apiSuccess({ ...loginResponseDto(), accessToken: 'opaque' }));

    const result = await repository.login({ username: 'emilys', password: 'emilyspass' });

    expect(result.ok && result.value.tokens.accessTokenExpiresAt).toBe(1_000_000 + 30 * 60_000);
  });

  it('maps a rejected login to invalidCredentials', async () => {
    const { repository } = setupRepository();
    const result = await repository.login({ username: 'emilys', password: 'wrong' });
    expect(!result.ok && result.error.kind).toBe('invalidCredentials');
  });

  it('passes network failures through unchanged', async () => {
    const { repository, publicApi } = setupRepository();
    publicApi.on('POST', '/auth/login', httpError(503, 'server'));
    const result = await repository.login({ username: 'emilys', password: 'emilyspass' });
    expect(!result.ok && result.error.kind).toBe('server');
  });

  it('maps a rejected refresh token to sessionExpired', async () => {
    const { repository, publicApi } = setupRepository();
    publicApi.on('POST', '/auth/refresh', httpError(403, 'forbidden'));
    const result = await repository.refresh('stale');
    expect(!result.ok && result.error.kind).toBe('sessionExpired');
  });

  it('renews tokens', async () => {
    const { repository, publicApi } = setupRepository();
    const result = await repository.refresh('refresh-1');
    expect(result.ok && result.value.refreshToken).toBe('refresh-2');
    expect(publicApi.requests[0]?.body).toEqual({ refreshToken: 'refresh-1', expiresInMins: 30 });
  });

  it('never sends the password for a demo sign-up', async () => {
    const { repository, publicApi } = setupRepository();
    const details = {
      firstName: 'Ada',
      lastName: 'L',
      email: 'ada@example.com',
      username: 'ada',
      password: 'secret123',
    };

    await expect(repository.registerDemoAccount(details)).resolves.toEqual(
      ok({ id: 209, firstName: 'Ada', username: 'ada' }),
    );
    expect(publicApi.requests[0]?.body).not.toHaveProperty('password');
  });

  it('sends the current access token as a bearer token to /auth/me (real HTTP stack)', async () => {
    const { adapter, requests } = createMockAxiosAdapter({ status: 200, data: loginResponseDto() });
    const factory = new AxiosHttpClientFactory({
      logger: createTestLogger(),
      connectivity: new FakeConnectivityService(),
      clock: new ManualClock(),
      idGenerator: sequentialIds(),
      getLanguage: () => 'en',
      defaults: { timeoutMs: 1000, retry: noRetry },
      adapter,
    });
    const repository = new DummyJsonAuthRepository({
      publicHttp: factory.create(DUMMYJSON_PUBLIC_API),
      authorizedHttp: factory.create(dummyJsonAuthorizedApi(new BearerTokenAuth(async () => 'live-token'))),
      clock: new ManualClock(),
    });

    const result = await repository.fetchCurrentUser();

    expect(result.ok && result.value.username).toBe('emilys');
    expect(requests[0]?.headers.get('Authorization')).toBe('Bearer live-token');
    // Cookies (DummyJSON also sets auth cookies) must never be stored or sent.
    expect(requests[0]?.withCredentials).toBeFalsy();
  });
});

describe('SecureSessionRepository', () => {
  function setup() {
    const secureStore = new InMemoryKeyValueStore();
    const plainStore = new InMemoryKeyValueStore();
    const logger = createTestLogger();
    return {
      secureStore,
      plainStore,
      logger,
      repository: new SecureSessionRepository(secureStore, plainStore, logger),
    };
  }

  it('round-trips the session through secure storage only', async () => {
    const { repository, secureStore, plainStore } = setup();
    const session = testSession();

    await repository.save(session);

    await expect(repository.load()).resolves.toEqual(ok(session));
    expect(secureStore.data.get(SESSION_SECURE_KEY)).toContain('access-1');
    // Plain storage only ever holds a marker, never a token.
    expect([...plainStore.data.values()].join()).not.toContain('access-1');
  });

  it('returns no session when nothing is stored', async () => {
    await expect(setup().repository.load()).resolves.toEqual(ok(null));
  });

  it('discards an unreadable session instead of failing', async () => {
    const { repository, secureStore, plainStore } = setup();
    secureStore.data.set(SESSION_SECURE_KEY, '{"user":');
    plainStore.data.set(SESSION_MARKER_KEY, '1');

    await expect(repository.load()).resolves.toEqual(ok(null));
    expect(secureStore.data.has(SESSION_SECURE_KEY)).toBe(false);
  });

  it('discards a keychain session left behind by a previous installation', async () => {
    const { repository, secureStore } = setup();
    // The keychain survived a reinstall, but app storage (and its marker) did not.
    secureStore.data.set(SESSION_SECURE_KEY, JSON.stringify(testSession()));

    await expect(repository.load()).resolves.toEqual(ok(null));
    expect(secureStore.data.has(SESSION_SECURE_KEY)).toBe(false);
  });

  it('removes both entries on clear', async () => {
    const { repository, secureStore, plainStore } = setup();
    await repository.save(testSession());

    await repository.clear();

    expect(secureStore.data.size).toBe(0);
    expect(plainStore.data.size).toBe(0);
  });

  it('reports a storage error when the keychain cannot be read', async () => {
    const { repository, secureStore } = setup();
    jest.spyOn(secureStore, 'getItem').mockRejectedValue(new Error('locked'));

    const result = await repository.load();

    expect(!result.ok && result.error.kind).toBe('storage');
  });
});
