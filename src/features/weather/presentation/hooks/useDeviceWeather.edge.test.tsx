import { act, renderHook, waitFor } from '@testing-library/react-native';
import { type ReactNode } from 'react';
import { Provider as ReduxProvider } from 'react-redux';

import { DependenciesProvider } from '@/core/di/DependenciesProvider';
import { AppError } from '@/core/errors/AppError';
import { err, ok, type Result } from '@/core/result';
import { captureAppState } from '@/testing/captureAppState';
import { createTestStore } from '@/testing/createTestStore';
import { FAKE_DEVICE_POSITION, FakeDeviceLocationService } from '@/testing/FakeDeviceLocationService';
import { type FakeHttpClient, FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { ManualClock } from '@/testing/ManualClock';
import { createTestDependencies } from '@/testing/testDependencies';
import { stubWeatherApi, WEATHER_NOW } from '@/testing/weatherFixtures';

import { type Coordinates } from '../../domain/Coordinates';
import { WEATHER_CACHE_SECONDS } from '../state/weatherApi';
import { type DeviceWeatherState, useDeviceWeather } from './useDeviceWeather';

const POSITION_FRESH_FOR = WEATHER_CACHE_SECONDS.deviceLocation * 1000;
const PORTO = { latitude: 41.15, longitude: -8.61 };

async function setup(configure?: (location: FakeDeviceLocationService, openMeteo: FakeHttpClient) => void) {
  const httpClientFactory = new FakeHttpClientFactory();
  const openMeteo = stubWeatherApi(httpClientFactory);
  const location = new FakeDeviceLocationService();
  configure?.(location, openMeteo);
  const clock = new ManualClock(WEATHER_NOW);
  const dependencies = createTestDependencies({ httpClientFactory, deviceLocationService: location, clock });
  const store = createTestStore(dependencies);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <DependenciesProvider dependencies={dependencies}>
      <ReduxProvider store={store}>{children}</ReduxProvider>
    </DependenciesProvider>
  );
  const rendered = await renderHook(() => useDeviceWeather(), { wrapper });
  return { ...rendered, location, openMeteo, clock };
}

function expectStatus<S extends DeviceWeatherState['status']>(
  state: DeviceWeatherState,
  status: S,
): Extract<DeviceWeatherState, { status: S }> {
  if (state.status !== status) throw new Error(`Expected ${status}, got ${JSON.stringify(state)}`);
  return state as Extract<DeviceWeatherState, { status: S }>;
}

async function locatedWithWeather(result: { current: DeviceWeatherState }) {
  await waitFor(() => expect(expectStatus(result.current, 'located').weather.status).toBe('ready'));
}

/** Lets pending promises settle so a call that should not happen has the chance to. */
const settle = () => act(async () => new Promise<void>((resolve) => setTimeout(resolve, 0)));

describe('useDeviceWeather edge cases back in the foreground', () => {
  let appState: ReturnType<typeof captureAppState>;
  beforeEach(() => {
    appState = captureAppState();
  });
  afterEach(() => appState.restore());

  it('does not re-read the position on a return inside the position cache window', async () => {
    const { result, location, openMeteo, clock } = await setup((location) => (location.permission = 'granted'));
    await locatedWithWeather(result);

    clock.advance(POSITION_FRESH_FOR - 1);
    await appState.foreground();
    await settle();

    expect(location.getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(openMeteo.requests).toHaveLength(1);
  });

  it('re-reads the position once the cache window has passed, without a new forecast when the traveller has not moved', async () => {
    const { result, location, openMeteo, clock } = await setup((location) => (location.permission = 'granted'));
    await locatedWithWeather(result);

    clock.advance(POSITION_FRESH_FOR);
    await appState.foreground();

    await waitFor(() => expect(location.getCurrentPosition).toHaveBeenCalledTimes(2));
    await settle();
    expect(expectStatus(result.current, 'located').location).toEqual(FAKE_DEVICE_POSITION);
    expect(openMeteo.requests).toHaveLength(1);
  });

  it('measures the position age from the latest read, not the first', async () => {
    const { result, location, clock } = await setup((location) => (location.permission = 'granted'));
    await locatedWithWeather(result);

    clock.advance(POSITION_FRESH_FOR);
    await appState.foreground();
    await waitFor(() => expect(location.getCurrentPosition).toHaveBeenCalledTimes(2));
    await settle();

    clock.advance(POSITION_FRESH_FOR - 1);
    await appState.foreground();
    await settle();
    expect(location.getCurrentPosition).toHaveBeenCalledTimes(2);
  });

  it('does not read the position on return while permission has not been granted', async () => {
    const { result, location, openMeteo, clock } = await setup();
    await waitFor(() => expect(result.current.status).toBe('needsPermission'));

    clock.advance(POSITION_FRESH_FOR * 10);
    await appState.foreground();
    await settle();

    expect(result.current.status).toBe('needsPermission');
    expect(location.getCurrentPosition).not.toHaveBeenCalled();
    expect(openMeteo.requests).toHaveLength(0);
  });

  it('reads the position once when the app returns while the first fix is still on its way', async () => {
    let answer: (position: Result<Coordinates, AppError>) => void = () => undefined;
    const { result, location } = await setup((location) => {
      location.permission = 'granted';
      location.getCurrentPosition.mockImplementationOnce(
        () => new Promise<Result<Coordinates, AppError>>((resolve) => (answer = resolve)),
      );
    });
    await waitFor(() => expect(location.getCurrentPosition).toHaveBeenCalledTimes(1));
    expect(result.current.status).toBe('locating');

    await appState.foreground();
    await settle();
    expect(location.getCurrentPosition).toHaveBeenCalledTimes(1);

    await act(async () => answer(ok(FAKE_DEVICE_POSITION)));
    await locatedWithWeather(result);
    expect(location.getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('stops listening once unmounted: no position read on a later return', async () => {
    const { result, location, openMeteo, clock, unmount } = await setup(
      (location) => (location.permission = 'granted'),
    );
    await locatedWithWeather(result);

    await unmount();
    clock.advance(POSITION_FRESH_FOR * 10);
    await appState.foreground();
    await settle();

    expect(location.getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(openMeteo.requests).toHaveLength(1);
  });

  it('shows the permission state again when access was revoked in Settings while away, without asking the OS for a fix', async () => {
    const { result, location, clock } = await setup((location) => (location.permission = 'granted'));
    await locatedWithWeather(result);

    location.permission = 'denied';
    clock.advance(POSITION_FRESH_FOR);
    await appState.foreground();

    await waitFor(() => expect(result.current.status).toBe('needsPermission'));
    expect(location.getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('keeps the last place on screen when the re-read on return fails, and tries again on the next return', async () => {
    const { result, location, clock } = await setup((location) => (location.permission = 'granted'));
    await locatedWithWeather(result);

    location.position = err(new AppError('locationUnavailable', 'services off'));
    clock.advance(POSITION_FRESH_FOR);
    await appState.foreground();
    await waitFor(() => expect(location.getCurrentPosition).toHaveBeenCalledTimes(2));
    await settle();
    expect(expectStatus(result.current, 'located').location).toEqual(FAKE_DEVICE_POSITION);

    location.position = ok(PORTO);
    await appState.foreground();

    await waitFor(() => expect(expectStatus(result.current, 'located').location).toEqual(PORTO));
    expect(location.getCurrentPosition).toHaveBeenCalledTimes(3);
  });

  it('keeps retrying on each return while location services stay off', async () => {
    const { result, location } = await setup((location) => {
      location.permission = 'granted';
      location.position = err(new AppError('locationUnavailable', 'services off'));
    });
    await waitFor(() => expect(result.current.status).toBe('locationError'));

    await appState.foreground();
    await waitFor(() => expect(location.getCurrentPosition).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.status).toBe('locationError'));

    await appState.foreground();
    await waitFor(() => expect(location.getCurrentPosition).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(result.current.status).toBe('locationError'));
  });
});
