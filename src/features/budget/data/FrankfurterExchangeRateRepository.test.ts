import { AxiosHttpClientFactory, ExponentialBackoffRetry } from '@/core/http';
import { ApiError } from '@/core/http/ApiError';
import { BUDGET_TODAY, CURRENCIES_DTO, ratesDto } from '@/testing/budgetFixtures';
import { FakeConnectivityService } from '@/testing/FakeConnectivityService';
import { apiFailure, apiSuccess, FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { ManualClock, sequentialIds } from '@/testing/ManualClock';
import { createMockAxiosAdapter, type MockReply } from '@/testing/mockAxiosAdapter';
import { createTestLogger } from '@/testing/testDependencies';
import { TRIPS_NOW } from '@/testing/tripFixtures';

import { FRANKFURTER_API } from './frankfurterApi';
import { FrankfurterExchangeRateRepository } from './FrankfurterExchangeRateRepository';

function setup() {
  const factory = new FakeHttpClientFactory();
  const http = factory.client('frankfurter');
  const repository = new FrankfurterExchangeRateRepository(factory.create(FRANKFURTER_API), new ManualClock(TRIPS_NOW));
  return { repository, http };
}

describe('FrankfurterExchangeRateRepository (fake HTTP)', () => {
  it('asks for the historical rate of a past date and keeps the decimal the API printed', async () => {
    const { repository, http } = setup();
    http.on('GET', '/2027-03-14', apiSuccess(ratesDto('EUR', '2027-03-12', { USD: 1.0805 })));
    const controller = new AbortController();

    const result = await repository.getRate('EUR', 'USD', '2027-03-14', controller.signal);

    expect(result).toEqual({ ok: true, value: { rate: '1.0805', rateDate: '2027-03-12', source: 'api' } });
    expect(http.requests[0]?.query).toEqual({ base: 'EUR', symbols: 'USD' });
    expect(http.requests[0]?.signal).toBe(controller.signal);
  });

  it.each([
    ['today', BUDGET_TODAY],
    ['a future date', '2027-09-01'],
  ])('asks for the latest rate for %s', async (_name, date) => {
    const { repository, http } = setup();
    http.on('GET', '/latest', apiSuccess(ratesDto('JPY', BUDGET_TODAY, { USD: 0.0061 })));

    const result = await repository.getRate('JPY', 'USD', date);

    expect(result).toEqual({ ok: true, value: { rate: '0.0061', rateDate: BUDGET_TODAY, source: 'api' } });
    expect(http.requests.map(({ path }) => path)).toEqual(['/latest']);
  });

  it('treats a response without the requested currency as an unsupported currency', async () => {
    const { repository, http } = setup();
    http.on('GET', '/2027-06-12', apiSuccess(ratesDto('EUR', '2027-06-12', {})));

    const result = await repository.getRate('EUR', 'PKR', '2027-06-12');

    expect(!result.ok && result.error.kind).toBe('badRequest');
  });

  it.each([
    ['a missing historical rate', 'notFound', 404],
    ['an unsupported currency', 'badRequest', 422],
    ['a server error', 'server', 503],
    ['rate limiting', 'rateLimited', 429],
    ['no connection', 'offline', undefined],
  ] as const)('passes on %s with its kind', async (_name, kind, status) => {
    const { repository, http } = setup();
    http.on('GET', '/2027-06-12', apiFailure(new ApiError(kind, 'failed', { status })));

    const result = await repository.getRate('EUR', 'USD', '2027-06-12');

    expect(!result.ok && result.error.kind).toBe(kind);
  });

  it('rejects a malformed response as a parse error', async () => {
    const { repository, http } = setup();
    http.on('GET', '/2027-06-12', apiSuccess({ base: 'EUR', rates: { USD: 'lots' } }));

    const result = await repository.getRate('EUR', 'USD', '2027-06-12');

    expect(!result.ok && result.error.kind).toBe('parse');
  });

  it('lists the supported currencies, sorted', async () => {
    const { repository, http } = setup();
    http.on('GET', '/currencies', apiSuccess({ USD: 'United States Dollar', EUR: 'Euro', AUD: 'Australian Dollar' }));

    expect(await repository.supportedCurrencies()).toEqual({ ok: true, value: ['AUD', 'EUR', 'USD'] });
  });
});

describe('FrankfurterExchangeRateRepository (real HTTP client)', () => {
  function realClient(...replies: MockReply[]) {
    const { adapter, requests } = createMockAxiosAdapter(...replies);
    const factory = new AxiosHttpClientFactory({
      logger: createTestLogger(),
      connectivity: new FakeConnectivityService(),
      clock: new ManualClock(),
      idGenerator: sequentialIds(),
      getLanguage: () => 'en',
      defaults: { timeoutMs: 1_000, retry: new ExponentialBackoffRetry({ maxRetries: 2, random: () => 0 }) },
      adapter,
      sleep: () => Promise.resolve(true),
    });
    return {
      repository: new FrankfurterExchangeRateRepository(factory.create(FRANKFURTER_API), new ManualClock(TRIPS_NOW)),
      requests,
    };
  }

  it('retries a timeout once, then reports it as a timeout', async () => {
    const { repository, requests } = realClient({ timeout: true });

    const result = await repository.getRate('EUR', 'USD', '2027-06-12');

    expect(!result.ok && result.error.kind).toBe('timeout');
    expect(requests).toHaveLength(2);
  });

  it('maps a 404 for a date without rates to notFound without retrying', async () => {
    const { repository, requests } = realClient({ status: 404, data: { message: 'not found' } });

    const result = await repository.getRate('EUR', 'USD', '1990-01-01');

    expect(!result.ok && result.error.kind).toBe('notFound');
    expect(requests).toHaveLength(1);
  });

  it('reads a real response', async () => {
    const { repository } = realClient({ status: 200, data: ratesDto('EUR', '2027-06-11', { USD: 1.0805 }) });

    expect(await repository.getRate('EUR', 'USD', '2027-06-12')).toEqual({
      ok: true,
      value: { rate: '1.0805', rateDate: '2027-06-11', source: 'api' },
    });
  });

  it('reads the currency list', async () => {
    const { repository } = realClient({ status: 200, data: CURRENCIES_DTO });

    const result = await repository.supportedCurrencies();

    expect(result.ok && result.value).toEqual(['AUD', 'EUR', 'GBP', 'JPY', 'USD']);
  });
});
