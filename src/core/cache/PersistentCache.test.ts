import { createNodeSqliteEngine } from '@/testing/nodeSqliteDriver';
import { FakeConnectivityService, OFFLINE, ONLINE } from '@/testing/FakeConnectivityService';
import { createOfflineStorage } from '@/testing/offlineFixtures';

import { ApiError } from '@/core/http/ApiError';
import { AppError } from '@/core/errors/AppError';
import { err, ok, type Result } from '@/core/result';

import { type CacheCodec, PersistentCache, type PersistentCachePolicy } from './PersistentCache';

interface Place {
  readonly name: string;
}

const placeCodec: CacheCodec<Place> = {
  encode: (value) => value,
  decode: (raw) =>
    typeof raw === 'object' && raw !== null && 'name' in raw && typeof raw.name === 'string'
      ? { value: { name: raw.name } }
      : null,
};

const MINUTE = 60_000;
const POLICY: PersistentCachePolicy = { freshForMs: 10 * MINUTE, maxStaleMs: 60 * MINUTE, maxEntries: 3 };

function setup(options: { engine?: ReturnType<typeof createNodeSqliteEngine>; version?: number } = {}) {
  const storage = createOfflineStorage({ engine: options.engine });
  const connectivity = new FakeConnectivityService();
  const cache = new PersistentCache<Place>({
    store: storage.cacheStore,
    namespace: 'test.places',
    version: options.version ?? 1,
    codec: placeCodec,
    policy: POLICY,
    clock: storage.clock,
    logger: storage.logger,
    connectivity,
  });
  const load = jest.fn<Promise<Result<Place, AppError>>, []>(async () => ok({ name: 'Lisbon' }));
  return { ...storage, cache, connectivity, load };
}

const offlineError = () => err(new AppError('offline', 'offline'));

describe('PersistentCache', () => {
  it('downloads on a miss, then serves the stored copy without a request while it is fresh', async () => {
    const { cache, load, clock } = setup();

    const first = await cache.get('lisbon', load);
    expect(first).toEqual(
      ok({ value: { name: 'Lisbon' }, source: 'network', storedAt: clock.now(), refreshError: null }),
    );

    clock.advance(9 * MINUTE);
    const second = await cache.get('lisbon', load);
    expect(second.ok && second.value.source).toBe('device');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('refreshes a stale copy when the network answers', async () => {
    const { cache, load, clock } = setup();
    await cache.get('lisbon', load);
    clock.advance(11 * MINUTE);
    load.mockResolvedValueOnce(ok({ name: 'Lisboa' }));

    const result = await cache.get('lisbon', load);

    expect(result.ok && result.value).toMatchObject({
      value: { name: 'Lisboa' },
      source: 'network',
      refreshError: null,
    });
  });

  it('shows the stored copy, marked with the reason, when a refresh fails offline', async () => {
    const { cache, load, clock } = setup();
    await cache.get('lisbon', load);
    const savedAt = clock.now();
    clock.advance(30 * MINUTE);
    load.mockResolvedValueOnce(offlineError());

    const result = await cache.get('lisbon', load);

    expect(result).toEqual(
      ok({ value: { name: 'Lisbon' }, source: 'device', storedAt: savedAt, refreshError: 'offline' }),
    );
  });

  it.each(['network', 'timeout', 'server', 'rateLimited'] as const)(
    'falls back to the stored copy on %s',
    async (kind) => {
      const { cache, load, clock } = setup();
      await cache.get('lisbon', load);
      clock.advance(30 * MINUTE);
      load.mockResolvedValueOnce(err(new AppError(kind, kind)));

      const result = await cache.get('lisbon', load);

      expect(result.ok && result.value.refreshError).toBe(kind);
    },
  );

  it('returns the error when there is no stored copy, or the failure is not one a copy can cover', async () => {
    const { cache, load, clock } = setup();
    load.mockResolvedValueOnce(offlineError());
    expect(await cache.get('lisbon', load)).toEqual(offlineError());

    await cache.get('lisbon', load);
    clock.advance(30 * MINUTE);
    load.mockResolvedValueOnce(err(new AppError('configuration', 'no key')));
    const result = await cache.get('lisbon', load);
    expect(!result.ok && result.error.kind).toBe('configuration');
  });

  it('never shows a copy older than maxStaleMs', async () => {
    const { cache, load, clock } = setup();
    await cache.get('lisbon', load);
    clock.advance(61 * MINUTE);
    load.mockResolvedValueOnce(offlineError());

    expect(await cache.get('lisbon', load)).toEqual(offlineError());
  });

  it('deletes the stored copy when the remote says it no longer exists', async () => {
    const { cache, load, clock, cacheStore } = setup();
    await cache.get('lisbon', load);
    clock.advance(11 * MINUTE);
    load.mockResolvedValueOnce(err(new AppError('notFound', 'gone')));

    await cache.get('lisbon', load);

    expect(await cacheStore.read('test.places', 'lisbon')).toBeNull();
  });

  it('honours Retry-After after a 429: no request until it passes, the copy shows meanwhile', async () => {
    const { cache, load, clock } = setup();
    await cache.get('lisbon', load);
    clock.advance(11 * MINUTE);
    load.mockResolvedValueOnce(err(new ApiError('rateLimited', '429', { status: 429, retryAfterMs: 20_000 })));
    await cache.get('lisbon', load);
    expect(load).toHaveBeenCalledTimes(2);

    clock.advance(10_000);
    const during = await cache.get('lisbon', load);
    expect(during.ok && during.value.refreshError).toBe('rateLimited');
    expect(load).toHaveBeenCalledTimes(2);

    clock.advance(10_001);
    const after = await cache.get('lisbon', load);
    expect(after.ok && after.value.source).toBe('network');
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('ends a Retry-After wait as soon as the device comes back online', async () => {
    const { cache, load, clock, connectivity } = setup();
    await cache.get('lisbon', load);
    clock.advance(11 * MINUTE);
    load.mockResolvedValueOnce(err(new ApiError('rateLimited', '429', { status: 429, retryAfterMs: 60_000 })));
    await cache.get('lisbon', load);

    connectivity.set(OFFLINE);
    connectivity.set(ONLINE);
    await cache.get('lisbon', load);

    expect(load).toHaveBeenCalledTimes(3);
  });

  it('makes a real request on every try after a 429 without Retry-After', async () => {
    const { cache, load } = setup();
    load.mockResolvedValueOnce(err(new AppError('rateLimited', '429')));
    await cache.get('lisbon', load);
    await cache.get('lisbon', load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('discards a stored copy that fails validation or has another format version', async () => {
    const { cache, load, clock, cacheStore } = setup();
    await cacheStore.write('test.places', 'bad', { payload: '{"nope":1}', version: 1, storedAt: clock.now() });
    await cacheStore.write('test.places', 'json', { payload: '{not json', version: 1, storedAt: clock.now() });
    await cacheStore.write('test.places', 'old', { payload: '{"name":"Old"}', version: 2, storedAt: clock.now() });
    load.mockResolvedValue(offlineError());

    for (const key of ['bad', 'json', 'old']) {
      expect(await cache.get(key, load)).toEqual(offlineError());
      expect(await cacheStore.read('test.places', key)).toBeNull();
    }
  });

  it('works network-only when the device store is unavailable (e.g. a failed migration)', async () => {
    const { cache, load, handle } = setup();
    handle.failOpens = 10;

    const result = await cache.get('lisbon', load);

    expect(result.ok && result.value).toMatchObject({ value: { name: 'Lisbon' }, source: 'network' });
  });

  it('keeps data across an app restart, so it shows offline after relaunching', async () => {
    const engine = createNodeSqliteEngine();
    const before = setup({ engine });
    await before.cache.get('lisbon', before.load);
    await before.database.close();

    const after = setup({ engine });
    after.clock.advance(30 * MINUTE);
    after.load.mockResolvedValueOnce(offlineError());
    const result = await after.cache.get('lisbon', after.load);

    expect(result.ok && result.value).toMatchObject({ value: { name: 'Lisbon' }, refreshError: 'offline' });
  });

  it('prunes expired copies and keeps only the newest maxEntries', async () => {
    const { cache, clock, cacheStore } = setup();
    for (const name of ['a', 'b', 'c', 'd']) {
      await cache.get(name, async () => ok({ name }));
      clock.advance(1);
    }
    await cache.prune();
    const [stats] = await cacheStore.stats();
    expect(stats?.entries).toBe(3);
    expect(await cacheStore.read('test.places', 'a')).toBeNull();

    clock.advance(61 * MINUTE);
    await cache.prune();
    expect(await cacheStore.stats()).toEqual([]);
  });
});
