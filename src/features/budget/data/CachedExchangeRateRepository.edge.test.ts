import { ApiError } from '@/core/http/ApiError';
import { BUDGET_TODAY, createBudgetStorage, ratesDto, stubFrankfurter } from '@/testing/budgetFixtures';
import { apiFailure, apiSuccess, FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { InMemoryKeyValueStore } from '@/testing/InMemoryKeyValueStore';
import { ManualClock } from '@/testing/ManualClock';
import { TRIPS_NOW } from '@/testing/tripFixtures';

import { CachedExchangeRateRepository, LATEST_RATE_TTL_MS } from './CachedExchangeRateRepository';
import { FRANKFURTER_API } from './frankfurterApi';
import { FrankfurterExchangeRateRepository } from './FrankfurterExchangeRateRepository';

const DAY_MS = 24 * 60 * 60_000;

function setup() {
  const storage = createBudgetStorage();
  const factory = new FakeHttpClientFactory();
  const http = stubFrankfurter(factory, { 'EUR>USD': 1.0805 });
  const clock = new ManualClock(TRIPS_NOW);
  const repository = new CachedExchangeRateRepository(
    new FrankfurterExchangeRateRepository(factory.create(FRANKFURTER_API), clock),
    storage.rateCache,
    clock,
    new InMemoryKeyValueStore(),
  );
  return { ...storage, http, clock, repository };
}

const offline = () => apiFailure(new ApiError('offline', 'No connection'));

describe('CachedExchangeRateRepository edge cases', () => {
  it('measures freshness of the latest rate from the clock time it was fetched at, even after the clock moved back', async () => {
    const { repository, http, clock } = setup();
    await repository.getRate('EUR', 'USD', BUDGET_TODAY);

    // Back an hour, then a full window forward: the clock now reads less than a window after the fetch.
    clock.advance(-60 * 60_000);
    clock.advance(LATEST_RATE_TTL_MS);
    await repository.getRate('EUR', 'USD', BUDGET_TODAY);

    expect(http.requests.filter(({ path }) => path === '/latest')).toHaveLength(1);
  });

  it('does not reuse a latest rate fetched in the future by a clock that was ahead', async () => {
    const { repository, http, clock } = setup();
    clock.advance(LATEST_RATE_TTL_MS * 4);
    // Still the same day in local time is not guaranteed, so ask for a date far ahead (always "latest").
    await repository.getRate('EUR', 'USD', '2030-01-01');
    clock.advance(-LATEST_RATE_TTL_MS * 4);

    await repository.getRate('EUR', 'USD', '2030-01-01');

    expect(http.requests.filter(({ path }) => path === '/latest')).toHaveLength(2);
  });

  it("asks for yesterday's historical rate once the day has passed, rather than reusing yesterday's latest", async () => {
    const { repository, http, clock } = setup();
    await repository.getRate('EUR', 'USD', BUDGET_TODAY);
    clock.advance(DAY_MS);

    const result = await repository.getRate('EUR', 'USD', BUDGET_TODAY);

    expect(result).toEqual({ ok: true, value: { rate: '1.0805', rateDate: BUDGET_TODAY, source: 'api' } });
    expect(http.requests.map(({ path }) => path)).toEqual(['/latest', `/${BUDGET_TODAY}`]);
  });

  it("falls back to yesterday's latest rate, with its own date, when the historical request fails offline", async () => {
    const { repository, http, clock } = setup();
    await repository.getRate('EUR', 'USD', BUDGET_TODAY);
    clock.advance(DAY_MS);
    http.otherwise(offline);

    const result = await repository.getRate('EUR', 'USD', BUDGET_TODAY);

    expect(result).toEqual({ ok: true, value: { rate: '1.0805', rateDate: BUDGET_TODAY, source: 'fallback' } });
  });

  it("does not keep for good an earlier day's rate given for yesterday before yesterday's was published", async () => {
    const { repository, http, clock } = setup();
    const yesterday = '2027-06-14';
    // Far east of CET just after midnight: the ECB hasn't published yesterday yet, so Friday's rate comes back.
    http.on('GET', `/${yesterday}`, apiSuccess(ratesDto('EUR', '2027-06-11', { USD: 1.07 })));
    await repository.getRate('EUR', 'USD', yesterday);
    await repository.getRate('EUR', 'USD', yesterday);
    expect(http.requests.filter(({ path }) => path === `/${yesterday}`)).toHaveLength(1);

    http.on('GET', `/${yesterday}`, apiSuccess(ratesDto('EUR', yesterday, { USD: 1.0805 })));
    clock.advance(LATEST_RATE_TTL_MS);
    const result = await repository.getRate('EUR', 'USD', yesterday);

    expect(result).toEqual({ ok: true, value: { rate: '1.0805', rateDate: yesterday, source: 'api' } });
    expect(http.requests.filter(({ path }) => path === `/${yesterday}`)).toHaveLength(2);
  });

  it("keeps an earlier day's rate for good once the date is settled (a weekend)", async () => {
    const { repository, http, clock } = setup();
    const saturday = '2027-06-12';
    http.on('GET', `/${saturday}`, apiSuccess(ratesDto('EUR', '2027-06-11', { USD: 1.07 })));
    await repository.getRate('EUR', 'USD', saturday);

    clock.advance(30 * DAY_MS);
    const result = await repository.getRate('EUR', 'USD', saturday);

    expect(result).toEqual({ ok: true, value: { rate: '1.07', rateDate: '2027-06-11', source: 'api' } });
    expect(http.requests.filter(({ path }) => path === `/${saturday}`)).toHaveLength(1);
  });

  it('never falls back to a rate published after the expense date', async () => {
    const { repository, http } = setup();
    await repository.getRate('EUR', 'USD', BUDGET_TODAY);
    http.otherwise(offline);

    const result = await repository.getRate('EUR', 'USD', '2027-06-01');

    expect(!result.ok && result.error.kind).toBe('offline');
  });
});
