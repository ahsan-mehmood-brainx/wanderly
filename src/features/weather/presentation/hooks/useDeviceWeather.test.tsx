import { act, renderHook, waitFor } from '@testing-library/react-native';
import { type ReactNode } from 'react';
import { Linking } from 'react-native';
import { Provider as ReduxProvider } from 'react-redux';

import { DependenciesProvider } from '@/core/di/DependenciesProvider';
import { AppError } from '@/core/errors/AppError';
import { err, ok } from '@/core/result';
import { captureAppState } from '@/testing/captureAppState';
import { createTestStore } from '@/testing/createTestStore';
import { httpFailure } from '@/testing/discoverFixtures';
import { FAKE_DEVICE_POSITION, FakeDeviceLocationService } from '@/testing/FakeDeviceLocationService';
import { type FakeHttpClient, FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { ManualClock } from '@/testing/ManualClock';
import { createTestDependencies } from '@/testing/testDependencies';
import { stubWeatherApi, WEATHER_NOW } from '@/testing/weatherFixtures';

import { type DeviceWeatherState, useDeviceWeather } from './useDeviceWeather';

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
  return { ...rendered, location, openMeteo, dependencies, clock };
}

const PORTO = { latitude: 41.15, longitude: -8.61 };

function expectStatus<S extends DeviceWeatherState['status']>(
  state: DeviceWeatherState,
  status: S,
): Extract<DeviceWeatherState, { status: S }> {
  if (state.status !== status) throw new Error(`Expected ${status}, got ${JSON.stringify(state)}`);
  return state as Extract<DeviceWeatherState, { status: S }>;
}

describe('useDeviceWeather', () => {
  it('AC7 asks for permission before locating when it is undetermined', async () => {
    const { result, location, openMeteo } = await setup();

    await waitFor(() => expect(result.current.status).toBe('needsPermission'));
    expect(expectStatus(result.current, 'needsPermission').requesting).toBe(false);
    expect(location.requestPermission).not.toHaveBeenCalled();
    expect(location.getCurrentPosition).not.toHaveBeenCalled();
    expect(openMeteo.requests).toHaveLength(0);
  });

  it('AC7 locates the device and loads its weather once request() is granted', async () => {
    const { result, location, openMeteo } = await setup();
    await waitFor(() => expect(result.current.status).toBe('needsPermission'));

    await act(async () => expectStatus(result.current, 'needsPermission').request());

    await waitFor(() => {
      const located = expectStatus(result.current, 'located');
      expect(located.weather.status).toBe('ready');
    });
    const located = expectStatus(result.current, 'located');
    expect(located.location).toEqual(FAKE_DEVICE_POSITION);
    expect(location.requestPermission).toHaveBeenCalledTimes(1);
    expect(openMeteo.requests).toHaveLength(1);
    expect(openMeteo.requests[0]?.query).toMatchObject(FAKE_DEVICE_POSITION);
  });

  it('AC7 goes straight to the weather when permission was already granted', async () => {
    const { result, location } = await setup((location) => (location.permission = 'granted'));

    await waitFor(() => {
      expect(expectStatus(result.current, 'located').weather.status).toBe('ready');
    });
    expect(location.requestPermission).not.toHaveBeenCalled();
  });

  it('AC7 stays on needsPermission when the user declines the prompt', async () => {
    const { result, location, openMeteo } = await setup((location) => (location.answerPromptWith = 'denied'));
    await waitFor(() => expect(result.current.status).toBe('needsPermission'));

    await act(async () => expectStatus(result.current, 'needsPermission').request());

    await waitFor(() => expect(location.requestPermission).toHaveBeenCalledTimes(1));
    expect(result.current.status).toBe('needsPermission');
    expect(location.getCurrentPosition).not.toHaveBeenCalled();
    expect(openMeteo.requests).toHaveLength(0);
  });

  it('AC7 reports blocked when only Settings can turn location back on', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValueOnce(undefined);
    const { result, location, openMeteo } = await setup((location) => (location.permission = 'blocked'));

    await waitFor(() => expect(result.current.status).toBe('blocked'));
    expect(location.getCurrentPosition).not.toHaveBeenCalled();
    expect(openMeteo.requests).toHaveLength(0);

    let opened = false;
    await act(async () => {
      opened = await expectStatus(result.current, 'blocked').openSettings();
    });
    expect(opened).toBe(true);
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it('AC7 returns false and logs when Settings cannot be opened', async () => {
    jest.spyOn(Linking, 'openSettings').mockRejectedValueOnce(new Error('no settings'));
    const { result, dependencies } = await setup((location) => (location.permission = 'blocked'));
    await waitFor(() => expect(result.current.status).toBe('blocked'));

    let opened = true;
    await act(async () => {
      opened = await expectStatus(result.current, 'blocked').openSettings();
    });

    expect(opened).toBe(false);
    expect(dependencies.logger.warn).toHaveBeenCalled();
  });

  it('AC7 reports an unavailable position with a retry that recovers', async () => {
    const { result, location, openMeteo } = await setup((location) => {
      location.permission = 'granted';
      location.position = err(new AppError('locationUnavailable', 'services off'));
    });

    await waitFor(() => expect(result.current.status).toBe('locationError'));
    const failed = expectStatus(result.current, 'locationError');
    expect(failed.errorKind).toBe('locationUnavailable');
    expect(openMeteo.requests).toHaveLength(0);

    location.position = ok(FAKE_DEVICE_POSITION);
    await act(async () => failed.retry());

    await waitFor(() => {
      expect(expectStatus(result.current, 'located').weather.status).toBe('ready');
    });
    expect(location.getCurrentPosition).toHaveBeenCalledTimes(2);
  });

  it('AC7 shows the permission state again when access is revoked while locating', async () => {
    const { result } = await setup((location) => {
      location.permission = 'granted';
      location.getCurrentPosition.mockImplementationOnce(async () => {
        location.permission = 'denied';
        return err(new AppError('locationPermissionDenied', 'revoked'));
      });
    });

    await waitFor(() => expect(result.current.status).toBe('needsPermission'));
  });

  it('AC7 treats a garbage 0,0 fix as an unavailable position, without a weather request', async () => {
    const { result, openMeteo } = await setup((location) => {
      location.permission = 'granted';
      location.position = ok({ latitude: 0, longitude: 0 });
    });

    await waitFor(() => expect(result.current.status).toBe('locationError'));
    expect(expectStatus(result.current, 'locationError').errorKind).toBe('locationUnavailable');
    expect(openMeteo.requests).toHaveLength(0);
  });

  it('AC7 passes a weather failure through once the device is located', async () => {
    const { result } = await setup((location, openMeteo) => {
      location.permission = 'granted';
      openMeteo.on('GET', '/forecast', httpFailure('timeout'));
    });

    await waitFor(() => {
      const located = expectStatus(result.current, 'located');
      expect(located.weather).toMatchObject({ status: 'error', errorKind: 'timeout' });
    });
  });
});

describe('useDeviceWeather back in the foreground', () => {
  let appState: ReturnType<typeof captureAppState>;
  beforeEach(() => {
    appState = captureAppState();
  });
  afterEach(() => appState.restore());

  it('AC7 re-reads the position, so the weather follows a traveller who moved while the app was away', async () => {
    const { result, location, openMeteo, clock } = await setup((location) => (location.permission = 'granted'));
    await waitFor(() => expect(expectStatus(result.current, 'located').weather.status).toBe('ready'));
    expect(expectStatus(result.current, 'located').location).toEqual(FAKE_DEVICE_POSITION);

    location.position = ok(PORTO);
    clock.advance(3 * 3_600_000);
    await appState.foreground();

    await waitFor(() => expect(expectStatus(result.current, 'located').location).toEqual(PORTO));
    await waitFor(() => {
      const located = expectStatus(result.current, 'located');
      expect(located.weather.status === 'ready' && located.weather.report.forecast.location).toEqual(PORTO);
    });
    expect(location.getCurrentPosition).toHaveBeenCalledTimes(2);
    expect(openMeteo.requests[openMeteo.requests.length - 1]?.query).toMatchObject(PORTO);
  });

  it('AC7 recovers by itself when location services were turned back on in Settings', async () => {
    const { result, location } = await setup((location) => {
      location.permission = 'granted';
      location.position = err(new AppError('locationUnavailable', 'services off'));
    });
    await waitFor(() => expect(result.current.status).toBe('locationError'));

    location.position = ok(FAKE_DEVICE_POSITION);
    await appState.foreground();

    await waitFor(() => expect(expectStatus(result.current, 'located').weather.status).toBe('ready'));
    expect(location.getCurrentPosition).toHaveBeenCalledTimes(2);
  });

  it('AC7 locates once access granted in Settings takes effect on return', async () => {
    const { result, location } = await setup((location) => (location.permission = 'blocked'));
    await waitFor(() => expect(result.current.status).toBe('blocked'));

    location.permission = 'granted';
    await appState.foreground();

    await waitFor(() => expect(expectStatus(result.current, 'located').weather.status).toBe('ready'));
    expect(location.getCurrentPosition).toHaveBeenCalledTimes(1);
  });
});
