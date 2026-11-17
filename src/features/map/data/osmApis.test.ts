import { AxiosHttpClientFactory, ExponentialBackoffRetry } from '@/core/http';
import { FakeConnectivityService } from '@/testing/FakeConnectivityService';
import { ManualClock, sequentialIds } from '@/testing/ManualClock';
import { MAP_CENTER } from '@/testing/mapFixtures';
import { createMockAxiosAdapter, type MockReply } from '@/testing/mockAxiosAdapter';
import { createTestLogger } from '@/testing/testDependencies';

import { NominatimGeocodingService } from './NominatimGeocodingService';
import { NOMINATIM_API, OVERPASS_API } from './osmApis';
import { OverpassPlacesApiService } from './OverpassPlacesApiService';

/** The real HTTP stack, with a retrying default so only the API definitions can turn retries off. */
function realHttp(reply: MockReply) {
  const { adapter, requests } = createMockAxiosAdapter(reply, { status: 200, data: [] });
  const clock = new ManualClock();
  const factory = new AxiosHttpClientFactory({
    logger: createTestLogger(),
    connectivity: new FakeConnectivityService(),
    clock,
    idGenerator: sequentialIds(),
    getLanguage: () => 'en',
    defaults: { timeoutMs: 1_000, retry: new ExponentialBackoffRetry({ maxRetries: 2 }) },
    adapter,
    // Retries (if any) would fire at once instead of after a real delay.
    sleep: () => Promise.resolve(true),
  });
  return { factory, clock, requests };
}

describe('OSM API definitions (real HTTP stack)', () => {
  it.each<[string, MockReply]>([
    ['a 429', { status: 429, headers: { 'retry-after': '1' } }],
    ['a 503', { status: 503 }],
    ['a network error', { networkError: true }],
  ])('Nominatim sends exactly one request for %s, so the throttle and cooldown stay in charge', async (_, reply) => {
    const { factory, clock, requests } = realHttp(reply);
    const service = new NominatimGeocodingService(factory.create(NOMINATIM_API), clock);

    const result = await service.search('Louvre');

    expect(result.ok).toBe(false);
    expect(requests).toHaveLength(1);
  });

  it('Overpass sends exactly one request for a 429', async () => {
    const { factory, clock, requests } = realHttp({ status: 429 });
    const service = new OverpassPlacesApiService(factory.create(OVERPASS_API), clock);

    const result = await service.fetchNearby(MAP_CENTER);

    expect(!result.ok && result.error.kind).toBe('rateLimited');
    expect(requests).toHaveLength(1);
  });
});
