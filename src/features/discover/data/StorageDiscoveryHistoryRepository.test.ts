import { InMemoryKeyValueStore } from '@/testing/InMemoryKeyValueStore';
import { createTestLogger } from '@/testing/testDependencies';

import { type RecentDestination } from '../domain/Destination';
import {
  RECENTLY_VIEWED_KEY,
  SEARCH_HISTORY_KEY,
  StorageDiscoveryHistoryRepository,
} from './StorageDiscoveryHistoryRepository';

const recent: RecentDestination = {
  id: 'country-pt',
  kind: 'country',
  name: 'Portugal',
  countryCode: 'PT',
  countryName: 'Portugal',
  imageUrl: 'https://flags.example/pt.png',
  flagEmoji: '🇵🇹',
  viewedAt: 123,
};

function setup(initial: Record<string, string> = {}) {
  const store = new InMemoryKeyValueStore(initial);
  const logger = createTestLogger();
  return { store, logger, repository: new StorageDiscoveryHistoryRepository(store, logger) };
}

describe('StorageDiscoveryHistoryRepository', () => {
  it('round-trips search history and recently viewed destinations', async () => {
    const { repository } = setup();

    await repository.saveSearchHistory(['lisbon', 'kyoto']);
    await repository.saveRecentlyViewed([recent]);

    await expect(repository.loadSearchHistory()).resolves.toEqual(['lisbon', 'kyoto']);
    await expect(repository.loadRecentlyViewed()).resolves.toEqual([recent]);
  });

  it('starts empty when nothing is stored or the data is unreadable', async () => {
    await expect(setup().repository.loadSearchHistory()).resolves.toEqual([]);
    const { repository } = setup({ [SEARCH_HISTORY_KEY]: '{not json', [RECENTLY_VIEWED_KEY]: '"a string"' });
    await expect(repository.loadSearchHistory()).resolves.toEqual([]);
    await expect(repository.loadRecentlyViewed()).resolves.toEqual([]);
  });

  it('drops only the bad entries, including ids that are no longer valid', async () => {
    const { repository } = setup({
      [SEARCH_HISTORY_KEY]: JSON.stringify(['lisbon', 42, '', 'kyoto']),
      [RECENTLY_VIEWED_KEY]: JSON.stringify([
        recent,
        { ...recent, id: '../../etc' },
        { ...recent, id: 'kyoto', kind: 'planet' },
        { ...recent, id: 'kyoto', imageUrl: 5, viewedAt: 'yesterday' },
      ]),
    });

    await expect(repository.loadSearchHistory()).resolves.toEqual(['lisbon', 'kyoto']);
    await expect(repository.loadRecentlyViewed()).resolves.toEqual([
      recent,
      { ...recent, id: 'kyoto', imageUrl: null, viewedAt: 0 },
    ]);
  });

  it('treats a storage read failure as empty history and logs it', async () => {
    const { repository, store, logger } = setup();
    jest.spyOn(store, 'getItem').mockRejectedValue(new Error('locked'));

    await expect(repository.loadSearchHistory()).resolves.toEqual([]);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('reports a storage write failure', async () => {
    const { repository, store } = setup();
    jest.spyOn(store, 'setItem').mockRejectedValue(new Error('disk full'));

    const result = await repository.saveSearchHistory(['lisbon']);

    expect(!result.ok && result.error.kind).toBe('storage');
  });
});
