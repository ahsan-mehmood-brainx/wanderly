import { AppError } from '@/core/errors/AppError';
import { ok } from '@/core/result';
import { FakeCountryRepository, FakePlaceContentRepository } from '@/testing/discoverFixtures';
import { createNodeSqliteEngine } from '@/testing/nodeSqliteDriver';
import { createOfflineStorage } from '@/testing/offlineFixtures';

import { GetDestinationDetails } from '../domain/usecases/GetDestinationDetails';
import { CachedCountryRepository, CachedPlaceContentRepository } from './caching';
import {
  catalogueCodec,
  COUNTRY_CACHE_POLICY,
  PersistentCountryRepository,
  PersistentPlaceContentRepository,
  summaryCodec,
} from './persistentCaching';

const DAY = 24 * 60 * 60_000;

/** The production stack: memory → device → (fake) remote, over real SQLite. */
function setup(engine = createNodeSqliteEngine()) {
  const storage = createOfflineStorage({ engine });
  const remoteCountries = new FakeCountryRepository();
  const remoteContent = new FakePlaceContentRepository();
  const deps = { store: storage.cacheStore, clock: storage.clock, logger: storage.logger };
  const countries = new CachedCountryRepository(new PersistentCountryRepository(remoteCountries, deps), storage.clock);
  const content = new CachedPlaceContentRepository(
    new PersistentPlaceContentRepository(remoteContent, deps),
    storage.clock,
  );
  return {
    ...storage,
    engine,
    remoteCountries,
    remoteContent,
    countries,
    content,
    details: new GetDestinationDetails(countries, content),
  };
}

const offline = () => new AppError('offline', 'offline');

describe('persistent destination data', () => {
  it('shows a destination viewed before offline after an app restart, marked as a saved copy', async () => {
    const first = setup();
    const online = await first.details.execute({ id: 'country-pt' });
    expect(online.ok && online.value.savedAt).toBeUndefined();
    await first.database.close();

    // Relaunch two days later with no connection.
    const second = setup(first.engine);
    second.clock.advance(2 * DAY);
    second.remoteCountries.allError = offline();
    second.remoteCountries.byCodeError = offline();
    for (const title of ['Portugal', 'Portugal (country)']) second.remoteContent.summaryErrors.set(title, offline());

    const result = await second.details.execute({ id: 'country-pt' });

    expect(result.ok).toBe(true);
    if (!result.ok || result.value.kind !== 'country') return;
    expect(result.value.country.name).toBe('Portugal');
    expect(result.value.description.status).toBe('available');
    expect(result.value.savedAt).toBe(first.clock.now());
  });

  it('serves fresh device copies without a request, and current data has no savedAt', async () => {
    const { details, remoteCountries, clock, database, engine } = setup();
    await details.execute({ id: 'country-pt' });
    await database.close();

    const relaunched = setup(engine);
    relaunched.clock.advance(clock.now() - relaunched.clock.now() + 60 * 60_000);
    const result = await relaunched.details.execute({ id: 'country-pt' });

    expect(relaunched.remoteCountries.getByCode).not.toHaveBeenCalled();
    expect(remoteCountries.getByCode).toHaveBeenCalledTimes(1);
    expect(result.ok && result.value.savedAt).toBeUndefined();
  });

  it('does not keep a saved copy in memory, so the next attempt after reconnecting refreshes', async () => {
    const { countries, remoteCountries, clock } = setup();
    await countries.getByCode('PT');
    clock.advance(COUNTRY_CACHE_POLICY.freshForMs + 1);
    remoteCountries.byCodeError = offline();

    const saved = await countries.getByCode('PT');
    expect(saved.ok && saved.value.savedAt).toBeDefined();

    remoteCountries.byCodeError = null;
    const refreshed = await countries.getByCode('PT');

    expect(refreshed.ok && refreshed.value.savedAt).toBeUndefined();
    expect(remoteCountries.getByCode).toHaveBeenCalledTimes(3);
  });

  it('keeps search working offline from the saved catalogue', async () => {
    const { countries, remoteCountries, clock } = setup();
    await countries.getAll();
    clock.advance(COUNTRY_CACHE_POLICY.freshForMs + 1);
    remoteCountries.allError = offline();

    const catalogue = await countries.getAll();

    expect(catalogue.ok && catalogue.value.length).toBeGreaterThan(0);
  });

  it('remembers that an article is missing, so offline lookups move on to the next title', async () => {
    const { content, remoteContent, clock } = setup();
    remoteContent.summaries.set('Georgia', null);
    await content.getSummary('Georgia');
    clock.advance(4 * DAY);
    remoteContent.summaryErrors.set('Georgia', offline());

    expect(await content.getSummary('Georgia')).toEqual(ok(null));
  });

  it('never stores search results (a stale title list is worse than none)', async () => {
    const { content, remoteContent, cacheStore } = setup();
    await content.searchTitles('lis', 5);
    await content.searchTitles('lis', 5);
    expect(remoteContent.searchTitles).toHaveBeenCalledTimes(2);
    expect(await cacheStore.stats()).toEqual([]);
  });
});

describe('codecs', () => {
  it('drop malformed countries but keep the rest of the catalogue', () => {
    const decoded = catalogueCodec.decode([{ code: 'XX' }, ...new FakeCountryRepository().countries.slice(0, 2)]);
    expect(decoded?.value).toHaveLength(2);
    expect(catalogueCodec.decode([{ code: 'XX' }])).toBeNull();
    expect(catalogueCodec.decode('nope')).toBeNull();
  });

  it('never store how a copy was served', () => {
    const [country] = new FakeCountryRepository().countries;
    const encoded = catalogueCodec.encode([{ ...country!, savedAt: 5 }]) as { savedAt?: number }[];
    expect(encoded[0]).not.toHaveProperty('savedAt');
    expect(summaryCodec.decode({ summary: null })).toEqual({ value: null });
    expect(summaryCodec.decode({ wrong: true })).toBeNull();
  });
});
