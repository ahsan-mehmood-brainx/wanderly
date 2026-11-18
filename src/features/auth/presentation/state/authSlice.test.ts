import { AxiosHttpClientFactory, noRetry } from '@/core/http';
import { createAppStore } from '@/core/store/store';
import { httpError, InMemorySessionRepository, stubDummyJson, TEST_USER, testSession } from '@/testing/authFixtures';
import { FakeConnectivityService } from '@/testing/FakeConnectivityService';
import { FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { ManualClock, sequentialIds } from '@/testing/ManualClock';
import { createMockAxiosAdapter } from '@/testing/mockAxiosAdapter';
import { createTestDependencies, createTestLogger } from '@/testing/testDependencies';

import { refreshProfile, restoreSession, signIn, signOut, validateSession } from './authSlice';

async function signedInStore(session = testSession(), clock = new ManualClock(1_000_000)) {
  const httpClientFactory = new FakeHttpClientFactory();
  const api = stubDummyJson(httpClientFactory);
  const sessionRepository = new InMemorySessionRepository(session);
  const dependencies = createTestDependencies({ httpClientFactory, sessionRepository, clock });
  const store = createAppStore(dependencies);
  await store.dispatch(restoreSession());
  return { store, api, dependencies, sessionRepository };
}

describe('auth state', () => {
  it('never puts tokens in Redux', async () => {
    const { store } = await signedInStore();
    expect(JSON.stringify(store.getState().auth)).not.toMatch(/access-1|refresh-1/);
  });

  it('refreshes the profile from /auth/me', async () => {
    const { store } = await signedInStore();

    await store.dispatch(refreshProfile());

    expect(store.getState().auth.user?.firstName).toBe('Emily R.');
    expect(store.getState().auth.profile.status).toBe('loaded');
  });

  it('keeps the saved profile and flags the failure when the refresh fails', async () => {
    const { store, api } = await signedInStore();
    api.authorizedApi.on('GET', '/auth/me', httpError(503, 'server'));

    await store.dispatch(refreshProfile());

    expect(store.getState().auth.user?.firstName).toBe('Emily');
    expect(store.getState().auth.profile).toEqual({ status: 'failed', error: 'server' });
  });

  it('signs out with a notice when an authenticated request finds the session expired', async () => {
    const { store, api, sessionRepository } = await signedInStore();
    api.authorizedApi.on('GET', '/auth/me', httpError(401, 'unauthorized'));
    api.publicApi.on('POST', '/auth/refresh', httpError(403, 'forbidden'));

    await store.dispatch(refreshProfile());

    expect(store.getState().auth.status).toBe('unauthenticated');
    expect(store.getState().auth.notice).toBe('sessionExpired');
    expect(sessionRepository.stored).toBeNull();
  });

  it('sends no unauthenticated /auth/me and keeps the profile idle when renewal is refused (real HTTP stack)', async () => {
    const clock = new ManualClock(1_000_000);
    // Replies in order: the refresh is refused; a credential-less /auth/me (if one were sent) would get a 401.
    const { adapter, requests } = createMockAxiosAdapter({ status: 403, data: {} }, { status: 401, data: {} });
    const httpClientFactory = new AxiosHttpClientFactory({
      logger: createTestLogger(),
      connectivity: new FakeConnectivityService(),
      clock,
      idGenerator: sequentialIds(),
      getLanguage: () => 'en',
      defaults: { timeoutMs: 1000, retry: noRetry },
      adapter,
    });
    const sessionRepository = new InMemorySessionRepository(testSession({ accessTokenExpiresAt: 2_000_000 }));
    const store = createAppStore(createTestDependencies({ httpClientFactory, sessionRepository, clock }));
    await store.dispatch(restoreSession());

    clock.advance(5_000_000);
    await store.dispatch(refreshProfile());

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual(['post /auth/refresh']);
    expect(store.getState().auth).toMatchObject({
      status: 'unauthenticated',
      notice: 'sessionExpired',
      profile: { status: 'idle', error: null },
    });
  });

  it('ignores profile results that settle after sign-out', async () => {
    const { store } = await signedInStore();
    await store.dispatch(signOut());
    const signedOutState = store.getState().auth;

    store.dispatch(refreshProfile.rejected(null, 'late-request', undefined, 'unauthorized'));
    store.dispatch(refreshProfile.rejected(null, 'late-request', undefined, 'sessionExpired'));
    store.dispatch(refreshProfile.fulfilled(TEST_USER, 'late-request', undefined));

    expect(store.getState().auth).toEqual(signedOutState);
  });

  it('renews an expired token when the app returns to the foreground, and only then', async () => {
    const clock = new ManualClock(1_000_000);
    const { store, api, sessionRepository } = await signedInStore(
      testSession({ accessTokenExpiresAt: 2_000_000 }),
      clock,
    );

    await store.dispatch(validateSession());
    expect(api.publicApi.requests).toHaveLength(0);

    // Hours later, the app comes back with a stale token.
    clock.advance(5_000_000);
    await store.dispatch(validateSession());

    expect(api.publicApi.requests.map((request) => request.path)).toEqual(['/auth/refresh']);
    expect(sessionRepository.stored?.tokens.refreshToken).toBe('refresh-2');
    expect(store.getState().auth.status).toBe('authenticated');
  });

  it('ignores a sign-in while one is already in flight', async () => {
    const httpClientFactory = new FakeHttpClientFactory();
    const api = stubDummyJson(httpClientFactory);
    const store = createAppStore(createTestDependencies({ httpClientFactory }));
    await store.dispatch(restoreSession());

    const credentials = { username: 'emilys', password: 'emilyspass' };
    const [first, second] = await Promise.all([
      store.dispatch(signIn(credentials)),
      store.dispatch(signIn(credentials)),
    ]);

    expect(first.meta.requestStatus).toBe('fulfilled');
    expect(second.meta.requestStatus).toBe('rejected');
    expect(api.publicApi.requests).toHaveLength(1);
    expect(store.getState().auth.status).toBe('authenticated');
  });

  it('signs out locally and records why', async () => {
    const { store, sessionRepository } = await signedInStore();

    await store.dispatch(signOut());

    expect(store.getState().auth).toMatchObject({ status: 'unauthenticated', user: null, notice: 'signedOut' });
    expect(sessionRepository.stored).toBeNull();
  });
});
