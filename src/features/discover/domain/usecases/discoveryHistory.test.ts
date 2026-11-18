import { AppError } from '@/core/errors/AppError';
import { err, ok, type Result } from '@/core/result';
import { createTestLogger } from '@/testing/testDependencies';

import { type RecentDestination } from '../Destination';
import { type DiscoveryHistoryRepository } from '../repositories';
import { DiscoveryHistory, MAX_RECENTLY_VIEWED, MAX_SEARCH_HISTORY } from './discoveryHistory';

class MemoryHistoryRepository implements DiscoveryHistoryRepository {
  searches: readonly string[] = [];
  views: readonly RecentDestination[] = [];
  saveError: AppError | null = null;

  loadSearchHistory = jest.fn(async () => this.searches);
  loadRecentlyViewed = jest.fn(async () => this.views);
  saveSearchHistory = jest.fn(async (queries: readonly string[]): Promise<Result<void, AppError>> => {
    if (this.saveError) return err(this.saveError);
    this.searches = queries;
    return ok(undefined);
  });
  saveRecentlyViewed = jest.fn(async (views: readonly RecentDestination[]): Promise<Result<void, AppError>> => {
    if (this.saveError) return err(this.saveError);
    this.views = views;
    return ok(undefined);
  });
}

const view = (id: string, viewedAt = 0): RecentDestination => ({
  id,
  kind: 'country',
  name: id,
  countryCode: null,
  countryName: null,
  imageUrl: null,
  flagEmoji: null,
  viewedAt,
});

function setup() {
  const repository = new MemoryHistoryRepository();
  const logger = createTestLogger();
  return { repository, logger, history: new DiscoveryHistory(repository, logger) };
}

describe('DiscoveryHistory: search history', () => {
  it('adds queries most-recent-first, trimmed, de-duplicated ignoring case and accents', async () => {
    const { history, repository } = setup();

    await history.addQuery('  Lisbon ');
    await history.addQuery('kyoto');
    const latest = await history.addQuery('LISBÓN');
    await history.flush();

    expect(latest).toEqual(['LISBÓN', 'kyoto']);
    expect(repository.searches).toEqual(['LISBÓN', 'kyoto']);
  });

  it('ignores queries too short to be worth remembering', async () => {
    const { history } = setup();
    await expect(history.addQuery(' a ')).resolves.toEqual([]);
  });

  it(`keeps at most ${MAX_SEARCH_HISTORY} entries`, async () => {
    const { history } = setup();
    for (let index = 0; index < MAX_SEARCH_HISTORY + 5; index++) await history.addQuery(`query ${index}`);
    const latest = await history.addQuery('newest');
    expect(latest).toHaveLength(MAX_SEARCH_HISTORY);
    expect(latest[0]).toBe('newest');
  });

  it('removes one entry or clears everything', async () => {
    const { history, repository } = setup();
    await history.addQuery('lisbon');
    await history.addQuery('kyoto');

    await expect(history.removeQuery('lisbon')).resolves.toEqual(['kyoto']);
    await expect(history.clearQueries()).resolves.toEqual([]);
    await history.flush();
    expect(repository.searches).toEqual([]);
  });

  it('loads saved history once', async () => {
    const { history, repository } = setup();
    repository.searches = ['porto'];

    await history.load();
    await history.addQuery('seoul');

    expect(repository.loadSearchHistory).toHaveBeenCalledTimes(1);
    await expect(history.load()).resolves.toMatchObject({ searchHistory: ['seoul', 'porto'] });
  });

  it('saves rapid changes in order, so the last write wins', async () => {
    const { history, repository } = setup();
    let releaseFirst: () => void = () => undefined;
    repository.saveSearchHistory.mockImplementationOnce(
      (queries) =>
        new Promise((resolve) => {
          releaseFirst = () => {
            repository.searches = queries;
            resolve(ok(undefined));
          };
        }),
    );

    await history.addQuery('first');
    await history.addQuery('second');
    releaseFirst();
    await history.flush();

    expect(repository.searches).toEqual(['second', 'first']);
  });

  it('does not lose changes started at the same time', async () => {
    const { history, repository } = setup();

    await Promise.all([history.addQuery('lisbon'), history.addQuery('kyoto'), history.recordView(view('country-pt'))]);
    await history.flush();

    expect(repository.searches).toEqual(['kyoto', 'lisbon']);
    expect(repository.views.map((entry) => entry.id)).toEqual(['country-pt']);
  });

  it('keeps working in memory and logs when saving fails', async () => {
    const { history, repository, logger } = setup();
    repository.saveError = new AppError('storage', 'disk full');

    await expect(history.addQuery('lisbon')).resolves.toEqual(['lisbon']);
    await history.flush();

    expect(logger.warn).toHaveBeenCalledWith('Could not save search history', { kind: 'storage' });
  });
});

describe('DiscoveryHistory: recently viewed', () => {
  it('moves a re-viewed destination to the top instead of duplicating it', async () => {
    const { history } = setup();
    await history.recordView(view('country-pt', 1));
    await history.recordView(view('kyoto', 2));
    const latest = await history.recordView(view('country-pt', 3));
    expect(latest.map((entry) => [entry.id, entry.viewedAt])).toEqual([
      ['country-pt', 3],
      ['kyoto', 2],
    ]);
  });

  it(`keeps at most ${MAX_RECENTLY_VIEWED} destinations, and clears`, async () => {
    const { history, repository } = setup();
    for (let index = 0; index < MAX_RECENTLY_VIEWED + 3; index++) await history.recordView(view(`place-${index}`));
    expect((await history.load()).recentlyViewed).toHaveLength(MAX_RECENTLY_VIEWED);

    await expect(history.clearViews()).resolves.toEqual([]);
    await history.flush();
    expect(repository.views).toEqual([]);
  });
});
