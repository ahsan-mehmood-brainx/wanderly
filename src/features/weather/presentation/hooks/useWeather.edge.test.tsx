import { act, renderHook, waitFor } from '@testing-library/react-native';
import { type ReactNode } from 'react';
import { Provider as ReduxProvider } from 'react-redux';

import { DependenciesProvider } from '@/core/di/DependenciesProvider';
import { forecastDtoSchema } from '@/features/weather/data/dto/openMeteoDtos';
import { toWeatherForecast } from '@/features/weather/data/openMeteoMappers';
import { WEATHER_CACHE_KEY } from '@/features/weather/data/StorageWeatherCache';
import { captureAppState } from '@/testing/captureAppState';
import { createTestStore } from '@/testing/createTestStore';
import { httpFailure } from '@/testing/discoverFixtures';
import { apiSuccess, type FakeHttpClient, FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { InMemoryKeyValueStore } from '@/testing/InMemoryKeyValueStore';
import { ManualClock } from '@/testing/ManualClock';
import { createTestDependencies } from '@/testing/testDependencies';
import { forecastDto, stubWeatherApi, WEATHER_NOW } from '@/testing/weatherFixtures';

import { DEFAULT_WEATHER_CACHE_POLICY } from '../../domain/usecases/GetWeatherForecast';
import { useWeather, type WeatherState } from './useWeather';

const LISBON = { latitude: 38.72, longitude: -9.14 };
const FRESH_FOR = DEFAULT_WEATHER_CACHE_POLICY.freshForMs;

interface SetupOptions {
  readonly keyValueStore?: InMemoryKeyValueStore;
  readonly configure?: (openMeteo: FakeHttpClient) => void;
}

function setup({ keyValueStore = new InMemoryKeyValueStore(), configure }: SetupOptions = {}) {
  const httpClientFactory = new FakeHttpClientFactory();
  const openMeteo = stubWeatherApi(httpClientFactory);
  configure?.(openMeteo);
  const clock = new ManualClock(WEATHER_NOW);
  const dependencies = createTestDependencies({ httpClientFactory, clock, keyValueStore });
  const store = createTestStore(dependencies);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <DependenciesProvider dependencies={dependencies}>
      <ReduxProvider store={store}>{children}</ReduxProvider>
    </DependenciesProvider>
  );
  return { openMeteo, clock, wrapper };
}

function expectReady(state: WeatherState): Extract<WeatherState, { status: 'ready' }> {
  if (state.status !== 'ready') throw new Error(`Expected a ready state, got ${JSON.stringify(state)}`);
  return state;
}

/** Lets pending promises (cache reads, refetches) settle so a request that should not happen has the chance to. */
const settle = () => act(async () => new Promise<void>((resolve) => setTimeout(resolve, 0)));

describe('useWeather edge cases back in the foreground', () => {
  let appState: ReturnType<typeof captureAppState>;
  beforeEach(() => {
    appState = captureAppState();
  });
  afterEach(() => appState.restore());

  it('keeps the forecast without a request when the app returns inside the fresh window', async () => {
    const { openMeteo, clock, wrapper } = setup();
    const { result } = await renderHook(() => useWeather(LISBON), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    clock.advance(FRESH_FOR - 1);
    await appState.foreground();
    await settle();

    expect(openMeteo.requests).toHaveLength(1);
    expect(expectReady(result.current).refreshing).toBe(false);
  });

  it('ignores inactive and background changes; only a return to active downloads again', async () => {
    const { openMeteo, clock, wrapper } = setup();
    const { result } = await renderHook(() => useWeather(LISBON), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    clock.advance(FRESH_FOR);
    await appState.send('inactive', 'background');
    await settle();
    expect(openMeteo.requests).toHaveLength(1);

    await appState.send('active');
    await waitFor(() => expect(openMeteo.requests).toHaveLength(2));
  });

  it('makes a single request when the app flips back to active twice in a row with a stale forecast', async () => {
    const { openMeteo, clock, wrapper } = setup();
    const { result } = await renderHook(() => useWeather(LISBON), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    clock.advance(FRESH_FOR);
    await appState.send('active', 'background', 'active');

    await waitFor(() => expect(expectReady(result.current).report.forecast.fetchedAt).toBe(clock.now()));
    await settle();
    expect(openMeteo.requests).toHaveLength(2);
  });

  it('stops listening once unmounted: no request on a later return', async () => {
    const { openMeteo, clock, wrapper } = setup();
    const { result, unmount } = await renderHook(() => useWeather(LISBON), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await unmount();
    clock.advance(FRESH_FOR * 4);
    await appState.foreground();
    await settle();

    expect(openMeteo.requests).toHaveLength(1);
  });

  it('makes no request on return when the place has no coordinates', async () => {
    const { openMeteo, clock, wrapper } = setup();
    const { result } = await renderHook(() => useWeather(null), { wrapper });

    clock.advance(FRESH_FOR);
    await appState.foreground();
    await settle();

    expect(result.current).toEqual({ status: 'error', errorKind: 'locationUnavailable', retry: null });
    expect(openMeteo.requests).toHaveLength(0);
  });

  it('retries an offline failure on return and shows the live forecast once the network is back', async () => {
    const { openMeteo, wrapper } = setup({ configure: (api) => api.on('GET', '/forecast', httpFailure('offline')) });
    const { result } = await renderHook(() => useWeather(LISBON), { wrapper });
    await waitFor(() => expect(result.current).toMatchObject({ status: 'error', errorKind: 'offline' }));

    openMeteo.on('GET', '/forecast', apiSuccess(forecastDto()));
    await appState.foreground();

    await waitFor(() => expect(expectReady(result.current).report.source).toBe('network'));
    expect(openMeteo.requests).toHaveLength(2);
  });

  it('stops retrying on return once a retried failure has recovered and the new forecast is fresh', async () => {
    const { openMeteo, wrapper } = setup({ configure: (api) => api.on('GET', '/forecast', httpFailure('server')) });
    const { result } = await renderHook(() => useWeather(LISBON), { wrapper });
    await waitFor(() => expect(result.current).toMatchObject({ status: 'error', errorKind: 'server' }));

    openMeteo.on('GET', '/forecast', apiSuccess(forecastDto()));
    await appState.foreground();
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await appState.foreground();
    await settle();
    expect(openMeteo.requests).toHaveLength(2);
  });

  it('keeps retrying on each return while the failure persists, and stays on the error', async () => {
    const { openMeteo, wrapper } = setup({ configure: (api) => api.on('GET', '/forecast', httpFailure('timeout')) });
    const { result } = await renderHook(() => useWeather(LISBON), { wrapper });
    await waitFor(() => expect(result.current).toMatchObject({ status: 'error', errorKind: 'timeout' }));

    await appState.foreground();
    await waitFor(() => expect(openMeteo.requests).toHaveLength(2));
    await waitFor(() => expect(result.current).toMatchObject({ status: 'error', errorKind: 'timeout' }));

    await appState.foreground();
    await waitFor(() => expect(openMeteo.requests).toHaveLength(3));
    await waitFor(() => expect(result.current).toMatchObject({ status: 'error', errorKind: 'timeout' }));
  });

  it('replaces a saved forecast shown as an offline fallback with a live one on return', async () => {
    const savedAt = WEATHER_NOW - 20 * 60_000;
    const keyValueStore = new InMemoryKeyValueStore();
    const saved = toWeatherForecast(forecastDtoSchema.parse(forecastDto({ now: savedAt })), LISBON, savedAt);
    await keyValueStore.setItem(WEATHER_CACHE_KEY, JSON.stringify([saved]));
    const { openMeteo, clock, wrapper } = setup({
      keyValueStore,
      configure: (api) => api.on('GET', '/forecast', httpFailure('offline')),
    });
    const { result } = await renderHook(() => useWeather(LISBON), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(expectReady(result.current).report).toMatchObject({ source: 'cache', fallbackReason: 'offline' });

    openMeteo.on('GET', '/forecast', apiSuccess(forecastDto()));
    await appState.foreground();

    await waitFor(() =>
      expect(expectReady(result.current).report).toMatchObject({ source: 'network', fallbackReason: null }),
    );
    expect(expectReady(result.current).report.forecast.fetchedAt).toBe(clock.now());
    expect(openMeteo.requests).toHaveLength(2);
  });

  it('keeps the shown forecast, marked as saved, when the download on return fails', async () => {
    const { openMeteo, clock, wrapper } = setup();
    const { result } = await renderHook(() => useWeather(LISBON), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const firstFetch = expectReady(result.current).report.forecast.fetchedAt;

    clock.advance(FRESH_FOR);
    openMeteo.on('GET', '/forecast', httpFailure('timeout'));
    await appState.foreground();

    await waitFor(() => expect(expectReady(result.current).report.fallbackReason).toBe('timeout'));
    expect(expectReady(result.current).report.forecast.fetchedAt).toBe(firstFetch);
    expect(openMeteo.requests).toHaveLength(2);
  });
});
