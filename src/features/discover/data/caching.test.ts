import { AppError } from '@/core/errors/AppError';
import { err, ok } from '@/core/result';
import { FakeCountryRepository, FakePlaceContentRepository } from '@/testing/discoverFixtures';
import { ManualClock } from '@/testing/ManualClock';

import { CachedCountryRepository, CachedPlaceContentRepository, MemoryCache } from './caching';

describe('CachedCountryRepository', () => {
  function setup() {
    const remote = new FakeCountryRepository();
    const clock = new ManualClock();
    return { remote, clock, repository: new CachedCountryRepository(remote, clock, 1_000) };
  }

  it('fetches the catalogue once and serves it from memory until it expires', async () => {
    const { remote, clock, repository } = setup();

    await repository.getAll();
    await repository.getAll();
    expect(remote.getAll).toHaveBeenCalledTimes(1);

    clock.advance(1_001);
    await repository.getAll();
    expect(remote.getAll).toHaveBeenCalledTimes(2);
  });

  it('caches country details per code (case-insensitively)', async () => {
    const { remote, repository } = setup();

    await repository.getByCode('pt');
    await repository.getByCode('PT');
    await repository.getByCode('JP');

    expect(remote.getByCode.mock.calls.map(([code]) => code)).toEqual(['PT', 'JP']);
  });

  it('shares one request between concurrent callers', async () => {
    const { remote, repository } = setup();

    const [first, second] = await Promise.all([repository.getAll(), repository.getAll()]);

    expect(remote.getAll).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });

  it('does not cache failures (offline, rate limited): the next call retries', async () => {
    const { remote, repository } = setup();
    remote.getAll.mockResolvedValueOnce(err(new AppError('rateLimited', '429')));

    expect((await repository.getAll()).ok).toBe(false);
    expect((await repository.getAll()).ok).toBe(true);
    expect(remote.getAll).toHaveBeenCalledTimes(2);
  });

  it('lets one caller cancel without cancelling the shared request for others', async () => {
    const { remote, repository } = setup();
    let finish: () => void = () => undefined;
    remote.getAll.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(ok(remote.countries));
        }),
    );
    const controller = new AbortController();

    const cancelled = repository.getAll(controller.signal);
    const patient = repository.getAll();
    controller.abort();
    finish();

    expect(await cancelled).toMatchObject({ ok: false, error: { kind: 'cancelled' } });
    expect((await patient).ok).toBe(true);
    // The completed request filled the cache.
    await repository.getAll();
    expect(remote.getAll).toHaveBeenCalledTimes(1);
    // The remote never sees a caller's signal, so one caller can't abort it for everyone.
    expect(remote.getAll).toHaveBeenCalledWith(undefined);
  });

  it('returns cancelled immediately for an already-aborted signal', async () => {
    const { remote, repository } = setup();
    const controller = new AbortController();
    controller.abort();
    expect(await repository.getAll(controller.signal)).toMatchObject({ ok: false, error: { kind: 'cancelled' } });
    expect(remote.getAll).not.toHaveBeenCalled();
  });
});

describe('CachedPlaceContentRepository', () => {
  it('caches summaries, including "no article", but never searches', async () => {
    const remote = new FakePlaceContentRepository();
    remote.summaries.set('Nowhere', null);
    const repository = new CachedPlaceContentRepository(remote, new ManualClock());

    await repository.getSummary('Kyoto');
    await repository.getSummary('Kyoto ');
    await repository.getSummary('Nowhere');
    await repository.getSummary('Nowhere');
    await repository.searchTitles('kyo', 5);
    await repository.searchTitles('kyo', 5);

    expect(remote.getSummary).toHaveBeenCalledTimes(2);
    expect(remote.searchTitles).toHaveBeenCalledTimes(2);
  });
});

describe('MemoryCache', () => {
  it('evicts the least recently used entry beyond its size', async () => {
    const cache = new MemoryCache<number>({ ttlMs: 10_000, maxEntries: 2, clock: new ManualClock() });
    const load = jest.fn(async () => ok(1));

    await cache.get('a', load);
    await cache.get('b', load);
    await cache.get('a', load); // refreshes "a"
    await cache.get('c', load); // evicts "b"
    await cache.get('a', load);
    await cache.get('b', load);

    expect(load).toHaveBeenCalledTimes(4);
  });

  it('turns a throwing loader into an error and recovers', async () => {
    const cache = new MemoryCache<number>({ ttlMs: 10_000, maxEntries: 2, clock: new ManualClock() });

    const failed = await cache.get('a', () => Promise.reject(new Error('boom')));
    const recovered = await cache.get('a', async () => ok(2));

    expect(failed).toMatchObject({ ok: false, error: { kind: 'unknown' } });
    expect(recovered).toEqual(ok(2));
  });
});
