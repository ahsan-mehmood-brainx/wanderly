import { act, renderHook, waitFor } from '@testing-library/react-native';
import { type ReactNode } from 'react';
import { Provider as ReduxProvider } from 'react-redux';

import { DependenciesProvider } from '@/core/di/DependenciesProvider';
import { type AppErrorKind } from '@/core/errors/AppError';
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

import { type Coordinates } from '../../domain/Coordinates';
import { DEFAULT_WEATHER_CACHE_POLICY } from '../../domain/usecases/GetWeatherForecast';
import { useWeather, type WeatherState } from './useWeather';

const LISBON_PRECISE = { latitude: 38.7223, longitude: -9.1393 };

interface SetupOptions {
  readonly now?: number;
  readonly keyValueStore?: InMemoryKeyValueStore;
  readonly configure?: (openMeteo: FakeHttpClient) => void;
}

function setup({ now = WEATHER_NOW, keyValueStore = new InMemoryKeyValueStore(), configure }: SetupOptions = {}) {
  const httpClientFactory = new FakeHttpClientFactory();
  const openMeteo = stubWeatherApi(httpClientFactory);
  configure?.(openMeteo);
  const clock = new ManualClock(now);
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

function expectError(state: WeatherState): Extract<WeatherState, { status: 'error' }> {
  if (state.status !== 'error') throw new Error(`Expected an error state, got ${JSON.stringify(state)}`);
  return state;
}

describe('useWeather', () => {
  it.each([null, undefined])(
    'AC1 reports locationUnavailable for %s coordinates without a request',
    async (location) => {
      const { openMeteo, wrapper } = setup();

      const { result } = await renderHook(() => useWeather(location), { wrapper });

      expect(result.current).toEqual({ status: 'error', errorKind: 'locationUnavailable', retry: null });
      expect(openMeteo.requests).toHaveLength(0);
    },
  );

  it.each<[string, Partial<Coordinates>]>([
    ['latitude above 90', { latitude: 91, longitude: 0 }],
    ['latitude below -90', { latitude: -90.5, longitude: 10 }],
    ['longitude above 180', { latitude: 10, longitude: 180.01 }],
    ['an infinite longitude', { latitude: 10, longitude: Number.POSITIVE_INFINITY }],
    ['a NaN latitude', { latitude: Number.NaN, longitude: 10 }],
    ['a missing longitude', { latitude: 10 }],
    ['0,0 (a defaulted position)', { latitude: 0, longitude: 0 }],
  ])('AC2 reports invalidLocation for %s without a request', async (_label, location) => {
    const { openMeteo, wrapper } = setup();

    const { result } = await renderHook(() => useWeather(location), { wrapper });

    expect(result.current).toEqual({ status: 'error', errorKind: 'invalidLocation', retry: null });
    expect(openMeteo.requests).toHaveLength(0);
  });

  it('AC3 goes from loading to ready with values from the Open-Meteo response', async () => {
    const dto = forecastDto();
    const maxTemperatures = Array.from({ length: 7 }, (_, day) => 21.6 + day * 1.5);
    const response = {
      ...dto,
      current: { ...dto.current, temperature_2m: 23.4, apparent_temperature: 21.9, relative_humidity_2m: 41 },
      daily: { ...dto.daily, temperature_2m_max: maxTemperatures },
    };
    const { openMeteo, wrapper } = setup({ configure: (api) => api.on('GET', '/forecast', apiSuccess(response)) });

    const states: WeatherState['status'][] = [];
    const { result } = await renderHook(
      () => {
        const state = useWeather(LISBON_PRECISE);
        states.push(state.status);
        return state;
      },
      { wrapper },
    );

    await waitFor(() => expect(result.current.status).toBe('ready'));
    const ready = expectReady(result.current);
    expect(states[0]).toBe('loading');
    expect(ready.report.source).toBe('network');
    expect(ready.report.fallbackReason).toBeNull();
    expect(ready.summary.now).toMatchObject({ temperatureC: 23.4, feelsLikeC: 21.9, humidityPercent: 41 });
    expect(ready.summary.days).toHaveLength(7);
    expect(ready.summary.days.map((day) => day.maxTemperatureC)).toEqual(maxTemperatures);
    expect(ready.now).toBe(WEATHER_NOW);
    expect(ready.refreshing).toBe(false);
    expect(openMeteo.requests).toHaveLength(1);
  });

  it('AC3 requests rounded coordinates with timezone=auto and unixtime', async () => {
    const { openMeteo, wrapper } = setup();

    const { result } = await renderHook(() => useWeather(LISBON_PRECISE), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(openMeteo.requests).toHaveLength(1);
    expect(openMeteo.requests[0]?.query).toMatchObject({
      latitude: 38.72,
      longitude: -9.14,
      timezone: 'auto',
      timeformat: 'unixtime',
    });
  });

  it("AC3 splits days at the forecast location's midnight, not UTC's", async () => {
    // 20:00 UTC on the 12th is 05:00 on the 13th in Tokyo.
    const now = Date.UTC(2026, 10, 12, 20, 0);
    const tokyo = forecastDto({ now, timezone: 'Asia/Tokyo', abbreviation: 'JST', utcOffsetSeconds: 9 * 3600 });
    const { wrapper } = setup({ now, configure: (api) => api.on('GET', '/forecast', apiSuccess(tokyo)) });

    const { result } = await renderHook(() => useWeather({ latitude: 35.68, longitude: 139.69 }), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const ready = expectReady(result.current);
    expect(ready.report.forecast.timeZone).toMatchObject({ id: 'Asia/Tokyo', utcOffsetSeconds: 9 * 3600 });
    expect(ready.summary.today?.date).toBe('2026-11-13');
    expect(ready.summary.days[0]?.date).toBe('2026-11-13');
  });

  it.each<AppErrorKind>(['server', 'timeout', 'offline'])(
    'AC4 shows a %s failure with a retry that recovers from the network',
    async (kind) => {
      const { openMeteo, wrapper } = setup({ configure: (api) => api.on('GET', '/forecast', httpFailure(kind)) });

      const { result } = await renderHook(() => useWeather(LISBON_PRECISE), { wrapper });
      await waitFor(() => expect(result.current.status).toBe('error'));

      const failed = expectError(result.current);
      expect(failed.errorKind).toBe(kind);
      expect(failed.retry).toEqual(expect.any(Function));

      openMeteo.on('GET', '/forecast', apiSuccess(forecastDto()));
      await act(async () => failed.retry?.());

      await waitFor(() => expect(result.current.status).toBe('ready'));
      expect(expectReady(result.current).report).toMatchObject({ source: 'network', fallbackReason: null });
      expect(openMeteo.requests).toHaveLength(2);
    },
  );

  it('AC5 falls back to the saved forecast, marked, when a refresh after the fresh window fails', async () => {
    const { openMeteo, clock, wrapper } = setup();
    const { result } = await renderHook(() => useWeather(LISBON_PRECISE), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const firstFetch = expectReady(result.current).report.forecast.fetchedAt;

    clock.advance(DEFAULT_WEATHER_CACHE_POLICY.freshForMs + 60_000);
    openMeteo.on('GET', '/forecast', httpFailure('timeout'));
    await act(async () => expectReady(result.current).refresh());

    await waitFor(() => expect(expectReady(result.current).report.source).toBe('cache'));
    const ready = expectReady(result.current);
    expect(ready.report.fallbackReason).toBe('timeout');
    expect(ready.report.forecast.fetchedAt).toBe(firstFetch);
    expect(ready.refreshing).toBe(false);
    expect(openMeteo.requests).toHaveLength(2);
  });

  it('AC5 opens straight onto a stale saved forecast, marked, when the network is down', async () => {
    const savedAt = WEATHER_NOW - 20 * 60_000;
    const keyValueStore = new InMemoryKeyValueStore();
    const saved = toWeatherForecast(
      forecastDtoSchema.parse(forecastDto({ now: savedAt })),
      { latitude: 38.72, longitude: -9.14 },
      savedAt,
    );
    await keyValueStore.setItem(WEATHER_CACHE_KEY, JSON.stringify([saved]));
    const { openMeteo, wrapper } = setup({
      keyValueStore,
      configure: (api) => api.on('GET', '/forecast', httpFailure('offline')),
    });

    const { result } = await renderHook(() => useWeather(LISBON_PRECISE), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    const ready = expectReady(result.current);
    expect(ready.report).toMatchObject({ source: 'cache', fallbackReason: 'offline' });
    expect(ready.report.forecast.fetchedAt).toBe(savedAt);
    expect(ready.summary.ageMs).toBe(20 * 60_000);
    expect(openMeteo.requests).toHaveLength(1);
  });

  it('AC6 shares one cached forecast between subscribers in the same ~1 km cell', async () => {
    const { openMeteo, wrapper } = setup();

    const { result } = await renderHook(
      () => [
        useWeather({ latitude: 38.7213, longitude: -9.1387 }),
        useWeather({ latitude: 38.7249, longitude: -9.1351 }),
      ],
      { wrapper },
    );
    await waitFor(() => expect(result.current.map((state) => state.status)).toEqual(['ready', 'ready']));

    expect(openMeteo.requests).toHaveLength(1);
    const [card, screen] = result.current.map(expectReady);
    expect(card?.report).toBe(screen?.report);
  });

  it('AC6 makes a separate request for coordinates in a different cell', async () => {
    const { openMeteo, wrapper } = setup();

    const { result } = await renderHook(
      () => [useWeather({ latitude: 38.72, longitude: -9.14 }), useWeather({ latitude: 38.73, longitude: -9.14 })],
      { wrapper },
    );
    await waitFor(() => expect(result.current.map((state) => state.status)).toEqual(['ready', 'ready']));

    expect(openMeteo.requests).toHaveLength(2);
    expect(openMeteo.requests.map((request) => request.query?.latitude)).toEqual([38.72, 38.73]);
  });

  it('switches to the new place when the coordinates change', async () => {
    const { openMeteo, wrapper } = setup();
    const { result, rerender } = await renderHook(
      ({ location }: { location: Coordinates | null }) => useWeather(location),
      { wrapper, initialProps: { location: null as Coordinates | null } },
    );
    expect(expectError(result.current).errorKind).toBe('locationUnavailable');

    await rerender({ location: LISBON_PRECISE });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(openMeteo.requests).toHaveLength(1);
  });
});

describe('useWeather back in the foreground', () => {
  let appState: ReturnType<typeof captureAppState>;
  beforeEach(() => {
    appState = captureAppState();
  });
  afterEach(() => appState.restore());

  it.each<AppErrorKind>(['server', 'timeout'])(
    'AC4 tries again by itself after a %s failure when the app returns',
    async (kind) => {
      const { openMeteo, clock, wrapper } = setup({
        configure: (api) => api.on('GET', '/forecast', httpFailure(kind)),
      });
      const { result } = await renderHook(() => useWeather(LISBON_PRECISE), { wrapper });
      await waitFor(() => expect(expectError(result.current).errorKind).toBe(kind));

      openMeteo.on('GET', '/forecast', apiSuccess(forecastDto()));
      clock.advance(DEFAULT_WEATHER_CACHE_POLICY.freshForMs);
      await appState.foreground();

      await waitFor(() => expect(result.current.status).toBe('ready'));
      expect(expectReady(result.current).report).toMatchObject({ source: 'network', fallbackReason: null });
      expect(openMeteo.requests).toHaveLength(2);
    },
  );

  it('AC2 makes no request on return when the coordinates are invalid', async () => {
    const { openMeteo, clock, wrapper } = setup();
    const { result } = await renderHook(() => useWeather({ latitude: 91, longitude: 0 }), { wrapper });

    clock.advance(DEFAULT_WEATHER_CACHE_POLICY.freshForMs);
    await appState.foreground();

    expect(result.current).toEqual({ status: 'error', errorKind: 'invalidLocation', retry: null });
    expect(openMeteo.requests).toHaveLength(0);
  });

  it('downloads a new forecast on return once the shown one is past the fresh window', async () => {
    const { openMeteo, clock, wrapper } = setup();
    const { result } = await renderHook(() => useWeather(LISBON_PRECISE), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    clock.advance(DEFAULT_WEATHER_CACHE_POLICY.freshForMs);
    await appState.foreground();

    await waitFor(() => expect(openMeteo.requests).toHaveLength(2));
    await waitFor(() => expect(expectReady(result.current).report.forecast.fetchedAt).toBe(clock.now()));
  });
});
