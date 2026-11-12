import { act, screen, userEvent } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { coordinatesKey } from '@/features/weather/domain/Coordinates';
import { forecastDtoSchema } from '@/features/weather/data/dto/openMeteoDtos';
import { toWeatherForecast } from '@/features/weather/data/openMeteoMappers';
import { WEATHER_CACHE_KEY } from '@/features/weather/data/StorageWeatherCache';
import { httpFailure, stubDiscoverApis, summaryDto } from '@/testing/discoverFixtures';
import { apiSuccess, type FakeHttpClient, FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { InMemoryKeyValueStore } from '@/testing/InMemoryKeyValueStore';
import { ManualClock } from '@/testing/ManualClock';
import { renderWithProviders } from '@/testing/renderWithProviders';
import { forecastDto, stubWeatherApi, WEATHER_NOW } from '@/testing/weatherFixtures';

import { summaryPath } from '../../data/WikipediaPlaceContentRepository';

import { DestinationWeatherScreen } from './DestinationWeatherScreen';

type Apis = ReturnType<typeof stubDiscoverApis> & { openMeteo: FakeHttpClient };

interface SetupOptions {
  readonly configure?: (apis: Apis) => void;
  readonly keyValueStore?: InMemoryKeyValueStore;
  readonly clock?: ManualClock;
}

async function setup(
  id = 'country-pt',
  { configure, keyValueStore = new InMemoryKeyValueStore(), clock = new ManualClock(WEATHER_NOW) }: SetupOptions = {},
) {
  const httpClientFactory = new FakeHttpClientFactory();
  const apis: Apis = { ...stubDiscoverApis(httpClientFactory), openMeteo: stubWeatherApi(httpClientFactory) };
  configure?.(apis);
  await renderWithProviders(<DestinationWeatherScreen destinationId={id} />, {
    dependencies: { httpClientFactory, keyValueStore, clock },
  });
  return { ...apis, user: userEvent.setup() };
}

/**
 * Captures `AppState` listeners so a test can bring the app back to the foreground.
 * The React Native preset's AppState is itself a mock; spying and `mockRestore()`
 * would wipe its implementation for later tests, so the function is swapped and restored.
 */
function captureAppState() {
  const listeners: ((state: AppStateStatus) => void)[] = [];
  const original = AppState.addEventListener;
  AppState.addEventListener = ((_type: string, listener: (state: AppStateStatus) => void) => {
    listeners.push(listener);
    return { remove: () => listeners.splice(listeners.indexOf(listener), 1) };
  }) as typeof AppState.addEventListener;
  return {
    foreground: () => act(() => listeners.forEach((listener) => listener('active'))),
    restore: () => {
      AppState.addEventListener = original;
    },
  };
}

describe('DestinationWeatherScreen', () => {
  // Device on UTC unless a test says otherwise, so "local time" notices are deterministic.
  let offset: jest.SpyInstance;
  beforeEach(() => {
    offset = jest.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(0);
  });
  afterEach(() => offset.mockRestore());

  it('shows current conditions, the next 24 hours, 7 days and details', async () => {
    await setup();

    expect(await screen.findByLabelText('Portugal: 15°, Partly cloudy')).toBeOnTheScreen();
    expect(screen.getByText('H 22° · L 10°')).toBeOnTheScreen();
    expect(screen.getByText('Feels like 14°')).toBeOnTheScreen();

    // Hourly carousel: starts with the hour in progress.
    expect(screen.getByRole('header', { name: 'Next 24 hours' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Now: 15°, Clear, 40% chance of rain')).toBeOnTheScreen();
    expect(screen.getByLabelText('11:00 AM: 16°, Mainly clear, 44% chance of rain')).toBeOnTheScreen();

    // Seven days, today first.
    expect(screen.getByRole('header', { name: '7-day forecast' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Today: Clear, high 22°, low 10°, 0% chance of rain')).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Wednesday, November 18: Mainly clear, high 28°, low 16°, 60% chance of rain'),
    ).toBeOnTheScreen();

    // Additional information.
    expect(screen.getByLabelText('Feels like: 14°')).toBeOnTheScreen();
    expect(screen.getByLabelText('Humidity: 72%')).toBeOnTheScreen();
    expect(screen.getByLabelText('Wind: 14 km/h from the northwest')).toBeOnTheScreen();
    expect(screen.getByLabelText('Chance of rain: 20%')).toBeOnTheScreen();
    expect(screen.getByLabelText('Sunrise: 7:30 AM')).toBeOnTheScreen();
    expect(screen.getByLabelText('Sunset: 5:15 PM')).toBeOnTheScreen();
    expect(screen.getByLabelText('UV index: 4')).toBeOnTheScreen();

    expect(screen.getByText('Forecast for the centre of Portugal.')).toBeOnTheScreen();
    expect(screen.getByText('Weather data by Open-Meteo.com (CC BY 4.0)')).toBeOnTheScreen();
    expect(screen.queryByTestId('weather-local-time')).toBeNull();
  });

  it("uses the destination's clock when it differs from the device's", async () => {
    // 10:30 UTC is 19:30 in Tokyo.
    await setup('country-jp', {
      configure: ({ openMeteo }) =>
        openMeteo.on(
          'GET',
          '/forecast',
          apiSuccess(forecastDto({ timezone: 'Asia/Tokyo', abbreviation: 'JST', utcOffsetSeconds: 9 * 3600 })),
        ),
    });

    expect(await screen.findByText('Times are local to this place (JST).')).toBeOnTheScreen();
    expect(screen.getByText('7:30 PM')).toBeOnTheScreen();
  });

  it('shows a saved forecast with its age when offline', async () => {
    const keyValueStore = new InMemoryKeyValueStore();
    const saved = toWeatherForecast(
      forecastDtoSchema.parse(forecastDto({ now: WEATHER_NOW - 3 * 3_600_000 })),
      { latitude: 1, longitude: 2 },
      WEATHER_NOW - 3 * 3_600_000,
    );
    await keyValueStore.setItem(WEATHER_CACHE_KEY, JSON.stringify([saved]));
    expect(coordinatesKey(saved.location)).toBe('1.00,2.00');

    await setup('country-pt', {
      keyValueStore,
      configure: ({ openMeteo }) => openMeteo.on('GET', '/forecast', httpFailure('offline')),
    });

    expect(await screen.findByText('Showing saved weather')).toBeOnTheScreen();
    expect(screen.getByText('Updated 3 hours ago. It will refresh when you are back online.')).toBeOnTheScreen();
    // "Now" comes from the saved hourly forecast for the current hour, not 3-hour-old conditions.
    expect(screen.getByLabelText('Portugal: 15°, Clear')).toBeOnTheScreen();
  });

  it('moves on to the new day, and asks for a new forecast, when the app returns after a night', async () => {
    const appState = captureAppState();
    try {
      const clock = new ManualClock(WEATHER_NOW);
      const { openMeteo } = await setup('country-pt', { clock });

      expect(await screen.findByLabelText(/^Today: /)).toBeOnTheScreen();
      expect(screen.getByLabelText(/^Friday, November 13: /)).toBeOnTheScreen();
      expect(openMeteo.requests).toHaveLength(1);

      // Next morning, offline: the forecast on screen must be re-read for the new day.
      clock.advance(24 * 3_600_000);
      openMeteo.on('GET', '/forecast', httpFailure('offline'));
      await appState.foreground();

      expect(await screen.findByText('Updated 1 day ago. It will refresh when you are back online.')).toBeOnTheScreen();
      expect(openMeteo.requests).toHaveLength(2);
      // Yesterday is gone and the 13th is now "Today".
      expect(screen.queryByLabelText(/^Friday, November 13: /)).toBeNull();
      expect(screen.getByLabelText(/^Today: /)).toBeOnTheScreen();
    } finally {
      appState.restore();
    }
  });

  it("offers a retry when a place's position couldn't be loaded, and shows its weather after", async () => {
    const { user, wikipedia, openMeteo } = await setup('kyoto', {
      configure: ({ wikipedia }) => wikipedia.on('GET', summaryPath('Kyoto'), httpFailure('server', 503)),
    });

    expect(
      await screen.findByText('The service is having trouble right now. Please try again later.'),
    ).toBeOnTheScreen();
    expect(screen.queryByText("We don't know exactly where this place is, so we can't show its weather.")).toBeNull();
    expect(openMeteo.requests).toHaveLength(0);

    wikipedia.on(
      'GET',
      summaryPath('Kyoto'),
      apiSuccess(summaryDto('Kyoto', { coordinates: { lat: 35.01164, lon: 135.76803 } })),
    );
    await user.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByLabelText(/^Kyoto: 15°/)).toBeOnTheScreen();
    expect(openMeteo.requests[0]?.query).toMatchObject({ latitude: 35.01, longitude: 135.77 });
  });

  it('shows a timeout with a retry that recovers', async () => {
    const { openMeteo, user } = await setup('country-pt', {
      configure: ({ openMeteo }) => openMeteo.on('GET', '/forecast', httpFailure('timeout')),
    });

    expect(await screen.findByText('This is taking longer than expected. Please try again.')).toBeOnTheScreen();

    openMeteo.on('GET', '/forecast', apiSuccess(forecastDto()));
    await user.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByLabelText('Portugal: 15°, Partly cloudy')).toBeOnTheScreen();
  });

  it('explains that a place without coordinates has no weather, with no retry', async () => {
    const { openMeteo } = await setup('kyoto');

    expect(await screen.findByText('Weather unavailable')).toBeOnTheScreen();
    expect(
      screen.getByText("We don't know exactly where this place is, so we can't show its weather."),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(openMeteo.requests).toHaveLength(0);
  });

  it('shows the destination error when the destination itself cannot load', async () => {
    const httpClientFactory = new FakeHttpClientFactory();
    stubDiscoverApis(httpClientFactory).restCountries.on('GET', '/codes.alpha_2/ZZ', httpFailure('notFound', 404));
    await renderWithProviders(<DestinationWeatherScreen destinationId="country-zz" />, {
      dependencies: { httpClientFactory },
    });

    expect(await screen.findByText("We couldn't find what you were looking for.")).toBeOnTheScreen();
  });
});
