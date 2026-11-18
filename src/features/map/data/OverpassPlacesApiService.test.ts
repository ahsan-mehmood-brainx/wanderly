import { type Clock } from '@/core/utils/Clock';
import { httpFailure } from '@/testing/discoverFixtures';
import { apiSuccess, FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { MAP_CENTER, overpassResponse, PARIS_ELEMENTS, stubOverpass } from '@/testing/mapFixtures';

import { OVERPASS_API, OVERPASS_INTERPRETER_PATH } from './osmApis';
import { OverpassPlacesApiService } from './OverpassPlacesApiService';
import { buildOverpassQuery } from './overpassQuery';

const fakeTimeClock: Clock = { now: () => Date.now() };
const LOUVRE_CENTER = { latitude: 48.861, longitude: 2.338 };

function setup() {
  const factory = new FakeHttpClientFactory();
  const http = stubOverpass(factory);
  const service = new OverpassPlacesApiService(factory.create(OVERPASS_API), fakeTimeClock);
  return { http, service };
}

describe('OverpassPlacesApiService', () => {
  beforeEach(() => jest.useFakeTimers({ now: 1_000_000 }));
  afterEach(() => jest.useRealTimers());

  it('makes exactly one identified GET /interpreter?data= request per centre, with the schema and signal', async () => {
    const { http, service } = setup();
    const controller = new AbortController();

    const result = await service.fetchNearby(MAP_CENTER, controller.signal);

    expect(result.ok).toBe(true);
    expect(OVERPASS_API.baseUrl).toBe('https://overpass-api.de/api');
    expect(OVERPASS_API.headers?.['User-Agent']).toMatch(/^Wanderly\/\d/);
    expect(http.requests).toHaveLength(1);
    expect(http.requests[0]).toMatchObject({
      method: 'GET',
      path: OVERPASS_INTERPRETER_PATH,
      query: { data: buildOverpassQuery(MAP_CENTER) },
      signal: controller.signal,
    });
    expect(http.requests[0]?.schema).toBeDefined();
  });

  it('runs requests one at a time, at least 2 s apart', async () => {
    const { http, service } = setup();

    await service.fetchNearby(MAP_CENTER);
    const second = service.fetchNearby(LOUVRE_CENTER);
    await jest.advanceTimersByTimeAsync(1_999);
    expect(http.requests).toHaveLength(1);

    await jest.advanceTimersByTimeAsync(1);
    expect((await second).ok).toBe(true);
    expect(http.requests).toHaveLength(2);
    expect(http.requests[1]?.query).toEqual({ data: buildOverpassQuery(LOUVRE_CENTER) });
  });

  it('cancels a request still waiting for its turn, without sending it', async () => {
    const { http, service } = setup();
    await service.fetchNearby(MAP_CENTER);
    const controller = new AbortController();

    const pending = service.fetchNearby(LOUVRE_CENTER, controller.signal);
    controller.abort();
    const result = await pending;
    await jest.advanceTimersByTimeAsync(5_000);

    expect(!result.ok && result.error.kind).toBe('cancelled');
    expect(http.requests).toHaveLength(1);
  });

  it('cools down after a 429 (Retry-After, else 30 s), returning rateLimited without a request', async () => {
    const { http, service } = setup();
    http.on('GET', OVERPASS_INTERPRETER_PATH, httpFailure('rateLimited', 429));

    const limited = await service.fetchNearby(MAP_CENTER);
    expect(!limited.ok && limited.error.kind).toBe('rateLimited');

    http.on('GET', OVERPASS_INTERPRETER_PATH, apiSuccess(overpassResponse(PARIS_ELEMENTS)));
    await jest.advanceTimersByTimeAsync(29_000);
    const refused = await service.fetchNearby(MAP_CENTER);
    expect(!refused.ok && refused.error.kind).toBe('rateLimited');
    expect(http.requests).toHaveLength(1);

    await jest.advanceTimersByTimeAsync(1_000);
    const pending = service.fetchNearby(MAP_CENTER);
    await jest.advanceTimersByTimeAsync(2_000);
    expect((await pending).ok).toBe(true);
    expect(http.requests).toHaveLength(2);
  });

  it('honours a Retry-After shorter than the default cooldown', async () => {
    const { http, service } = setup();
    http.on('GET', OVERPASS_INTERPRETER_PATH, httpFailure('rateLimited', 429, 5_000));
    await service.fetchNearby(MAP_CENTER);
    http.on('GET', OVERPASS_INTERPRETER_PATH, apiSuccess(overpassResponse(PARIS_ELEMENTS)));

    await jest.advanceTimersByTimeAsync(5_000);
    const pending = service.fetchNearby(MAP_CENTER);
    await jest.advanceTimersByTimeAsync(2_000);

    expect((await pending).ok).toBe(true);
  });

  it.each([
    'runtime error: Query timed out in "query" at line 3 after 26 seconds.',
    'runtime error: Query run out of memory using about 2048 MB of RAM.',
  ])('maps a runtime-error remark to server: %s', async (remark) => {
    const { http, service } = setup();
    http.on('GET', OVERPASS_INTERPRETER_PATH, apiSuccess(overpassResponse([], { remark })));

    const result = await service.fetchNearby(MAP_CENTER);

    expect(!result.ok && result.error.kind).toBe('server');
  });

  it.each([
    ['offline', httpFailure('offline')],
    ['network', httpFailure('network')],
    ['timeout', httpFailure('timeout')],
    ['server', httpFailure('server', 504)],
  ])('passes a %s failure through', async (kind, failure) => {
    const { http, service } = setup();
    http.on('GET', OVERPASS_INTERPRETER_PATH, failure);

    const result = await service.fetchNearby(MAP_CENTER);

    expect(!result.ok && result.error.kind).toBe(kind);
  });

  it('reports a response that is not Overpass JSON as a parse error', async () => {
    const { http, service } = setup();
    http.on('GET', OVERPASS_INTERPRETER_PATH, apiSuccess('<html>Too busy</html>'));

    const result = await service.fetchNearby(MAP_CENTER);

    expect(!result.ok && result.error.kind).toBe('parse');
  });
});
