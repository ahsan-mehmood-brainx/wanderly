import { createTestStore } from '@/testing/createTestStore';
import { countryPage, httpFailure, stubDiscoverApis, WORLD_DTOS } from '@/testing/discoverFixtures';
import { apiSuccess, FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { InMemoryKeyValueStore } from '@/testing/InMemoryKeyValueStore';
import { createTestDependencies } from '@/testing/testDependencies';

import { RECENTLY_VIEWED_KEY } from '../../data/StorageDiscoveryHistoryRepository';
import { NO_FILTERS } from '../../domain/SearchFilters';
import { discoverApi } from './discoverApi';
import { loadDiscoveryHistory, recordDestinationView, rememberSearch } from './discoverSlice';

function setup() {
  const httpClientFactory = new FakeHttpClientFactory();
  const apis = stubDiscoverApis(httpClientFactory);
  const keyValueStore = new InMemoryKeyValueStore();
  const dependencies = createTestDependencies({ httpClientFactory, keyValueStore });
  const store = createTestStore(dependencies);
  return { store, dependencies, keyValueStore, ...apis };
}

const detailRequests = (client: ReturnType<typeof setup>['restCountries'], code: string) =>
  client.requests.filter((request) => request.path === `/codes.alpha_2/${code}`);

describe('discoverApi (RTK Query over use cases)', () => {
  it('caches destination details: a second visit makes no request', async () => {
    const { store, restCountries, wikipedia } = setup();

    const first = store.dispatch(discoverApi.endpoints.destinationDetails.initiate('country-pt'));
    const details = await first.unwrap();
    const second = store.dispatch(discoverApi.endpoints.destinationDetails.initiate('country-pt'));
    await second.unwrap();

    expect(details).toMatchObject({ kind: 'country', country: { name: 'Portugal' } });
    expect(detailRequests(restCountries, 'PT')).toHaveLength(1);
    expect(wikipedia.requests.filter((request) => request.path.includes('Portugal'))).toHaveLength(1);
    first.unsubscribe();
    second.unsubscribe();
  });

  it('shares one country catalogue between search, the feed and filters', async () => {
    const { store, restCountries } = setup();

    await Promise.all([
      store.dispatch(discoverApi.endpoints.searchDestinations.initiate({ query: 'portugal', filters: NO_FILTERS })),
      store.dispatch(discoverApi.endpoints.popularCountries.initiate()),
      store.dispatch(discoverApi.endpoints.filterOptions.initiate()),
    ]);

    expect(restCountries.requests.filter((request) => request.path === '')).toHaveLength(1);
  });

  it('stores failures as a serialisable error kind', async () => {
    const { store, restCountries } = setup();
    restCountries.on('GET', '', httpFailure('rateLimited', 429));

    const result = await store.dispatch(discoverApi.endpoints.popularCountries.initiate());

    expect(result.error).toEqual({ kind: 'rateLimited' });
  });

  it('does not cache failures: a refetch tries again and recovers', async () => {
    const { store, restCountries } = setup();
    restCountries.on('GET', '/codes.alpha_2/PT', httpFailure('server', 503));
    const failed = await store.dispatch(discoverApi.endpoints.destinationDetails.initiate('country-pt'));
    expect(failed.error).toEqual({ kind: 'server' });

    restCountries.on('GET', '/codes.alpha_2/PT', apiSuccess(countryPage([WORLD_DTOS[0]])));
    const retried = await store.dispatch(
      discoverApi.endpoints.destinationDetails.initiate('country-pt', { forceRefetch: true }),
    );

    expect(retried.data).toMatchObject({ country: { name: 'Portugal' } });
    expect(detailRequests(restCountries, 'PT')).toHaveLength(2);
  });
});

describe('discover history state', () => {
  it('records a viewed destination, persists it and restores it on the next launch', async () => {
    const { store, keyValueStore, dependencies } = setup();
    await store.dispatch(loadDiscoveryHistory());
    const details = await store.dispatch(discoverApi.endpoints.destinationDetails.initiate('kyoto')).unwrap();

    await store.dispatch(recordDestinationView(details));
    await store.dispatch(rememberSearch('kyoto'));
    await dependencies.discoveryHistory.flush();

    expect(store.getState().discover.recentlyViewed.map((recent) => recent.id)).toEqual(['kyoto']);
    expect(store.getState().discover.searchHistory).toEqual(['kyoto']);
    expect(keyValueStore.data.get(RECENTLY_VIEWED_KEY)).toContain('"kyoto"');

    // Next launch: a new container over the same storage.
    const nextStore = createTestStore(createTestDependencies({ keyValueStore }));
    await nextStore.dispatch(loadDiscoveryHistory());
    expect(nextStore.getState().discover).toMatchObject({
      status: 'ready',
      searchHistory: ['kyoto'],
      recentlyViewed: [{ id: 'kyoto', name: 'Kyoto', countryCode: 'JP', countryName: 'Japan' }],
    });
  });
});
