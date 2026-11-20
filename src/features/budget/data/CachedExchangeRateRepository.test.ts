import { ApiError } from '@/core/http/ApiError';
import { BUDGET_TODAY, createBudgetStorage, stubFrankfurter } from '@/testing/budgetFixtures';
import { apiFailure, FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { InMemoryKeyValueStore } from '@/testing/InMemoryKeyValueStore';
import { ManualClock } from '@/testing/ManualClock';
import { TRIPS_NOW } from '@/testing/tripFixtures';

import {
  CachedExchangeRateRepository,
  CURRENCIES_STORAGE_KEY,
  CURRENCIES_TTL_MS,
  LATEST_RATE_TTL_MS,
} from './CachedExchangeRateRepository';
import { FRANKFURTER_API } from './frankfurterApi';
import { FrankfurterExchangeRateRepository } from './FrankfurterExchangeRateRepository';
import { LATEST_RATE } from './LocalExchangeRateCache';

const DAY = '2027-06-12';
const YEAR_MS = 365 * 24 * 60 * 60_000;

function setup(rates: Record<string, number> = { 'EUR>USD': 1.0805, 'JPY>USD': 0.0061 }) {
  const storage = createBudgetStorage();
  const factory = new FakeHttpClientFactory();
  const http = stubFrankfurter(factory, rates);
  const clock = new ManualClock(TRIPS_NOW);
  const store = new InMemoryKeyValueStore();
  const repository = new CachedExchangeRateRepository(
    new FrankfurterExchangeRateRepository(factory.create(FRANKFURTER_API), clock),
    storage.rateCache,
    clock,
    store,
  );
  return { ...storage, http, clock, store, repository };
}

const offline = () => apiFailure(new ApiError('offline', 'No connection'));

describe('CachedExchangeRateRepository', () => {
  it('asks the API on a miss and saves the rate with the date the API returned', async () => {
    const { repository, http, rateCache } = setup();

    const result = await repository.getRate('EUR', 'USD', DAY);

    expect(result).toEqual({ ok: true, value: { rate: '1.0805', rateDate: DAY, source: 'api' } });
    expect(http.requests.map(({ path }) => path)).toEqual([`/${DAY}`]);
    const cached = await rateCache.get('EUR', 'USD', DAY);
    expect(cached.ok && cached.value).toMatchObject({ rate: '1.0805', rateDate: DAY, fetchedAt: TRIPS_NOW });
  });

  it('serves a cached historical rate without a request, however old it is', async () => {
    const { repository, http, clock } = setup();
    await repository.getRate('EUR', 'USD', DAY);
    clock.advance(YEAR_MS);

    const again = await repository.getRate('EUR', 'USD', DAY);

    expect(again).toEqual({ ok: true, value: { rate: '1.0805', rateDate: DAY, source: 'api' } });
    expect(http.requests).toHaveLength(1);
  });

  it('serves a rate cached by an earlier session (it lives in SQLite)', async () => {
    const { repository, http, rateCache } = setup();
    await rateCache.save({
      base: 'EUR',
      quote: 'USD',
      requestedDate: DAY,
      rate: '1.0799',
      rateDate: DAY,
      fetchedAt: 1,
    });

    const result = await repository.getRate('EUR', 'USD', DAY);

    expect(result).toEqual({ ok: true, value: { rate: '1.0799', rateDate: DAY, source: 'api' } });
    expect(http.requests).toHaveLength(0);
  });

  it('reuses the latest rate for six hours, for today and future dates alike', async () => {
    const { repository, http, clock, rateCache } = setup();

    await repository.getRate('JPY', 'USD', BUDGET_TODAY);
    await repository.getRate('JPY', 'USD', '2027-09-01');
    clock.advance(LATEST_RATE_TTL_MS - 1);
    await repository.getRate('JPY', 'USD', BUDGET_TODAY);

    expect(http.requests.map(({ path }) => path)).toEqual(['/latest']);
    const cached = await rateCache.get('JPY', 'USD', LATEST_RATE);
    expect(cached.ok && cached.value?.rate).toBe('0.0061');

    clock.advance(2);
    await repository.getRate('JPY', 'USD', BUDGET_TODAY);
    expect(http.requests.map(({ path }) => path)).toEqual(['/latest', '/latest']);
  });

  it.each([
    ['offline', () => offline()],
    ['timing out', () => apiFailure(new ApiError('timeout', 'Timed out'))],
    ['failing with a server error', () => apiFailure(new ApiError('server', 'Down', { status: 503 }))],
    ['rate limiting', () => apiFailure(new ApiError('rateLimited', 'Slow down', { status: 429 }))],
    ['missing the historical rate', () => apiFailure(new ApiError('notFound', 'Missing', { status: 404 }))],
  ])('falls back to the nearest earlier cached rate when the API is %s', async (_name, failure) => {
    const { repository, http, rateCache } = setup();
    await rateCache.save({
      base: 'EUR',
      quote: 'USD',
      requestedDate: '2027-06-10',
      rate: '1.07',
      rateDate: '2027-06-10',
      fetchedAt: 1,
    });
    http.on('GET', `/${DAY}`, failure());

    const result = await repository.getRate('EUR', 'USD', DAY);

    expect(result).toEqual({ ok: true, value: { rate: '1.07', rateDate: '2027-06-10', source: 'fallback' } });
  });

  it('does not fall back to a later rate or another pair', async () => {
    const { repository, http, rateCache } = setup();
    await rateCache.save({
      base: 'EUR',
      quote: 'USD',
      requestedDate: '2027-06-13',
      rate: '1.2',
      rateDate: '2027-06-13',
      fetchedAt: 1,
    });
    await rateCache.save({
      base: 'GBP',
      quote: 'USD',
      requestedDate: '2027-06-10',
      rate: '1.3',
      rateDate: '2027-06-10',
      fetchedAt: 1,
    });
    http.on('GET', `/${DAY}`, offline());

    const result = await repository.getRate('EUR', 'USD', DAY);

    expect(!result.ok && result.error.kind).toBe('offline');
  });

  it('reports the API failure when nothing is cached, and never caches it', async () => {
    const { repository, http } = setup();
    http.on('GET', `/${DAY}`, offline());

    const first = await repository.getRate('EUR', 'USD', DAY);
    const second = await repository.getRate('EUR', 'USD', DAY);

    expect(!first.ok && first.error.kind).toBe('offline');
    expect(!second.ok && second.error.kind).toBe('offline');
    expect(http.requests).toHaveLength(2);
  });

  it('reports an unsupported currency as badRequest', async () => {
    const { repository, http } = setup();
    http.on('GET', `/${DAY}`, apiFailure(new ApiError('badRequest', 'Unknown currency', { status: 422 })));

    const result = await repository.getRate('EUR', 'PKR', DAY);

    expect(!result.ok && result.error.kind).toBe('badRequest');
  });

  describe('supported currencies', () => {
    it('keeps the list for seven days', async () => {
      const { repository, http, clock, store } = setup();

      expect(await repository.supportedCurrencies()).toEqual({
        ok: true,
        value: ['AUD', 'EUR', 'GBP', 'JPY', 'USD'],
      });
      clock.advance(CURRENCIES_TTL_MS - 1);
      await repository.supportedCurrencies();
      expect(http.requests.filter(({ path }) => path === '/currencies')).toHaveLength(1);
      expect(await store.getItem(CURRENCIES_STORAGE_KEY)).not.toBeNull();

      clock.advance(2);
      await repository.supportedCurrencies();
      expect(http.requests.filter(({ path }) => path === '/currencies')).toHaveLength(2);
    });

    it('uses an expired list when the API is unavailable', async () => {
      const { repository, http, clock } = setup();
      await repository.supportedCurrencies();
      clock.advance(CURRENCIES_TTL_MS + 1);
      http.on('GET', '/currencies', offline());

      expect(await repository.supportedCurrencies()).toEqual({
        ok: true,
        value: ['AUD', 'EUR', 'GBP', 'JPY', 'USD'],
      });
    });

    it('reports the failure when no list was ever saved', async () => {
      const { repository, http } = setup();
      http.on('GET', '/currencies', offline());

      const result = await repository.supportedCurrencies();

      expect(!result.ok && result.error.kind).toBe('offline');
    });
  });
});
