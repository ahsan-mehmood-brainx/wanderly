import { type Clock } from '@/core/utils/Clock';
import { httpFailure } from '@/testing/discoverFixtures';
import { apiSuccess, FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { LOUVRE_RESULT, stubNominatim } from '@/testing/mapFixtures';

import { NominatimGeocodingService } from './NominatimGeocodingService';
import { NOMINATIM_API, NOMINATIM_SEARCH_PATH } from './osmApis';

const fakeTimeClock: Clock = { now: () => Date.now() };

function setup() {
  const factory = new FakeHttpClientFactory();
  const http = stubNominatim(factory);
  const service = new NominatimGeocodingService(factory.create(NOMINATIM_API), fakeTimeClock);
  return { http, service };
}

describe('NominatimGeocodingService', () => {
  beforeEach(() => jest.useFakeTimers({ now: 1_000_000 }));
  afterEach(() => jest.useRealTimers());

  it('searches nominatim.openstreetmap.org with q, format=jsonv2 and limit=5, identified, with schema and signal', async () => {
    const { http, service } = setup();
    const controller = new AbortController();

    const result = await service.search('Louvre', controller.signal);

    expect(result.ok).toBe(true);
    expect(NOMINATIM_API.baseUrl).toBe('https://nominatim.openstreetmap.org');
    expect(NOMINATIM_API.headers?.['User-Agent']).toMatch(/^Wanderly\/\d/);
    expect(http.requests).toHaveLength(1);
    expect(http.requests[0]).toMatchObject({
      method: 'GET',
      path: NOMINATIM_SEARCH_PATH,
      query: { q: 'Louvre', format: 'jsonv2', limit: 5 },
      signal: controller.signal,
    });
    expect(http.requests[0]?.schema).toBeDefined();
  });

  it('spaces requests at least 1 s apart', async () => {
    const { http, service } = setup();

    await service.search('Louvre');
    const second = service.search('Orsay');
    await jest.advanceTimersByTimeAsync(999);
    expect(http.requests).toHaveLength(1);

    await jest.advanceTimersByTimeAsync(1);
    await second;
    expect(http.requests).toHaveLength(2);
  });

  it('cools down for the Retry-After time after a 429, refusing searches without a request', async () => {
    const { http, service } = setup();
    http.on('GET', NOMINATIM_SEARCH_PATH, httpFailure('rateLimited', 429, 10_000));

    const limited = await service.search('Louvre');
    expect(!limited.ok && limited.error.kind).toBe('rateLimited');

    http.on('GET', NOMINATIM_SEARCH_PATH, apiSuccess([LOUVRE_RESULT]));
    await jest.advanceTimersByTimeAsync(9_000);
    const refused = await service.search('Louvre');
    expect(!refused.ok && refused.error.kind).toBe('rateLimited');
    expect(http.requests).toHaveLength(1);

    await jest.advanceTimersByTimeAsync(1_000);
    const pending = service.search('Louvre');
    await jest.advanceTimersByTimeAsync(1_000);
    expect((await pending).ok).toBe(true);
    expect(http.requests).toHaveLength(2);
  });

  it('cools down for 30 s after a 429 without Retry-After', async () => {
    const { http, service } = setup();
    http.on('GET', NOMINATIM_SEARCH_PATH, httpFailure('rateLimited', 429));
    await service.search('Louvre');
    http.on('GET', NOMINATIM_SEARCH_PATH, apiSuccess([LOUVRE_RESULT]));

    await jest.advanceTimersByTimeAsync(29_000);
    expect((await service.search('Louvre')).ok).toBe(false);

    await jest.advanceTimersByTimeAsync(1_000);
    const pending = service.search('Louvre');
    await jest.advanceTimersByTimeAsync(1_000);
    expect((await pending).ok).toBe(true);
  });

  it.each([
    ['offline', httpFailure('offline')],
    ['network', httpFailure('network')],
    ['timeout', httpFailure('timeout')],
    ['server', httpFailure('server', 503)],
  ])('passes a %s failure through, without a cooldown', async (kind, failure) => {
    const { http, service } = setup();
    http.on('GET', NOMINATIM_SEARCH_PATH, failure);

    const result = await service.search('Louvre');
    expect(!result.ok && result.error.kind).toBe(kind);

    http.on('GET', NOMINATIM_SEARCH_PATH, apiSuccess([LOUVRE_RESULT]));
    const pending = service.search('Louvre');
    await jest.advanceTimersByTimeAsync(1_000);
    expect((await pending).ok).toBe(true);
  });

  it('reports a response that is not a list as a parse error', async () => {
    const { http, service } = setup();
    http.on('GET', NOMINATIM_SEARCH_PATH, apiSuccess({ error: 'Unable to geocode' }));

    const result = await service.search('Louvre');

    expect(!result.ok && result.error.kind).toBe('parse');
  });
});
