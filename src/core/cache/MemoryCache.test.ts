import { ok } from '@/core/result';
import { ManualClock } from '@/testing/ManualClock';

import { MemoryCache } from './MemoryCache';

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
