import { createTestStore } from '@/testing/createTestStore';
import { httpFailure } from '@/testing/discoverFixtures';
import { FakeDeviceLocationService } from '@/testing/FakeDeviceLocationService';
import { FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { InMemoryKeyValueStore } from '@/testing/InMemoryKeyValueStore';
import { ManualClock } from '@/testing/ManualClock';
import { createTestDependencies } from '@/testing/testDependencies';
import { stubWeatherApi, WEATHER_NOW } from '@/testing/weatherFixtures';

import { weatherApi } from './weatherApi';

const LISBON = { latitude: 38.72, longitude: -9.14 };

function setup() {
  const httpClientFactory = new FakeHttpClientFactory();
  const openMeteo = stubWeatherApi(httpClientFactory);
  const keyValueStore = new InMemoryKeyValueStore();
  const deviceLocationService = new FakeDeviceLocationService();
  const clock = new ManualClock(WEATHER_NOW);
  const dependencies = createTestDependencies({ httpClientFactory, keyValueStore, deviceLocationService, clock });
  return { store: createTestStore(dependencies), openMeteo, keyValueStore, deviceLocationService, clock };
}

describe('weatherApi (RTK Query over use cases)', () => {
  it('caches a forecast per location: a second subscriber makes no request', async () => {
    const { store, openMeteo } = setup();

    const first = store.dispatch(weatherApi.endpoints.forecast.initiate(LISBON));
    const report = await first.unwrap();
    const second = store.dispatch(weatherApi.endpoints.forecast.initiate({ ...LISBON }));
    await second.unwrap();

    expect(report.source).toBe('network');
    expect(report.forecast.hourly.length).toBeGreaterThan(0);
    expect(openMeteo.requests).toHaveLength(1);
    first.unsubscribe();
    second.unsubscribe();
  });

  it('survives a restart through the device cache, and refetch() goes to the network', async () => {
    const first = setup();
    await first.store.dispatch(weatherApi.endpoints.forecast.initiate(LISBON)).unwrap();

    // A new store (app restart) over the same device storage, 5 minutes later.
    const httpClientFactory = new FakeHttpClientFactory();
    const openMeteo = stubWeatherApi(httpClientFactory);
    const restarted = createTestStore(
      createTestDependencies({
        httpClientFactory,
        keyValueStore: first.keyValueStore,
        clock: new ManualClock(WEATHER_NOW + 5 * 60_000),
      }),
    );
    const subscription = restarted.dispatch(weatherApi.endpoints.forecast.initiate(LISBON));
    expect((await subscription.unwrap()).source).toBe('cache');
    expect(openMeteo.requests).toHaveLength(0);

    expect((await subscription.refetch().unwrap()).source).toBe('network');
    expect(openMeteo.requests).toHaveLength(1);
    subscription.unsubscribe();
  });

  it('shows the saved forecast, marked, when the network fails later', async () => {
    const { store, openMeteo, clock } = setup();
    await store.dispatch(weatherApi.endpoints.forecast.initiate(LISBON)).unwrap();
    clock.advance(2 * 3_600_000);
    openMeteo.on('GET', '/forecast', httpFailure('offline'));

    const subscription = store.dispatch(weatherApi.endpoints.forecast.initiate(LISBON, { forceRefetch: true }));
    const report = await subscription.unwrap();

    expect(report).toMatchObject({ source: 'cache', fallbackReason: 'offline' });
    subscription.unsubscribe();
  });

  it('stores failures as a serialisable error kind', async () => {
    const { store, openMeteo } = setup();
    openMeteo.on('GET', '/forecast', httpFailure('timeout'));

    const result = await store.dispatch(weatherApi.endpoints.forecast.initiate(LISBON));

    expect(result.error).toEqual({ kind: 'timeout' });
  });

  it('locates the device through the use case', async () => {
    const { store, deviceLocationService, clock } = setup();
    deviceLocationService.permission = 'granted';

    const result = await store.dispatch(weatherApi.endpoints.deviceLocation.initiate());

    expect(result.data).toEqual({ coordinates: { latitude: 38.72, longitude: -9.14 }, readAt: clock.now() });
  });
});
