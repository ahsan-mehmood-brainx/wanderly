import { act, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Linking } from 'react-native';

import { AppError } from '@/core/errors/AppError';
import { err, ok } from '@/core/result';
import { routes } from '@/shared/navigation/routes';
import { FakeDeviceLocationService } from '@/testing/FakeDeviceLocationService';
import { FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { ManualClock } from '@/testing/ManualClock';
import { renderWithProviders } from '@/testing/renderWithProviders';
import { seededTripDatabase, storedTrip } from '@/testing/tripFixtures';
import { stubWeatherApi, WEATHER_NOW } from '@/testing/weatherFixtures';

import { TripScreen } from './TripScreen';
import { TripWeatherScreen } from './TripWeatherScreen';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
}));

async function setup(configure?: (location: FakeDeviceLocationService) => void) {
  const httpClientFactory = new FakeHttpClientFactory();
  const openMeteo = stubWeatherApi(httpClientFactory);
  const location = new FakeDeviceLocationService();
  configure?.(location);
  const { database } = await seededTripDatabase([storedTrip({ id: 't-1' })]);
  await renderWithProviders(<TripScreen tripId="t-1" />, {
    dependencies: { database, httpClientFactory, deviceLocationService: location, clock: new ManualClock(WEATHER_NOW) },
  });
  await screen.findByTestId('trip-screen');
  return { location, openMeteo, user: userEvent.setup() };
}

describe('TripScreen weather', () => {
  beforeEach(() => jest.mocked(router.push).mockClear());

  it('explains before asking for location, then shows the weather where the traveller is', async () => {
    const { location, openMeteo, user } = await setup();

    expect(screen.getByTestId('trip-screen')).toBeOnTheScreen();
    expect(await screen.findByText(/Allow location access to see the weather where you are/)).toBeOnTheScreen();
    expect(location.requestPermission).not.toHaveBeenCalled();
    expect(openMeteo.requests).toHaveLength(0);

    await user.press(screen.getByRole('button', { name: 'Use my location' }));

    expect(await screen.findByLabelText('Your location: 15°, Partly cloudy')).toBeOnTheScreen();
    expect(location.requestPermission).toHaveBeenCalledTimes(1);
    expect(openMeteo.requests[0]?.query).toMatchObject({ latitude: 38.72, longitude: -9.14 });

    await user.press(screen.getByRole('button', { name: 'See full forecast' }));
    expect(router.push).toHaveBeenCalledWith(routes.tripWeather('t-1'));
  });

  it('shows the weather straight away when permission was already granted', async () => {
    await setup((location) => (location.permission = 'granted'));

    expect(await screen.findByLabelText('Your location: 15°, Partly cloudy')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Use my location' })).toBeNull();
  });

  it('stays on the explanation when the user declines', async () => {
    const { user, openMeteo } = await setup((location) => (location.answerPromptWith = 'denied'));

    await user.press(await screen.findByRole('button', { name: 'Use my location' }));

    expect(await screen.findByRole('button', { name: 'Use my location' })).toBeOnTheScreen();
    expect(openMeteo.requests).toHaveLength(0);
  });

  it('points to Settings when location is blocked, and says so if Settings cannot open', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockRejectedValueOnce(new Error('no settings'));
    const { user } = await setup((location) => (location.permission = 'blocked'));

    expect(await screen.findByText(/Location access is off for Wanderly/)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Open Settings' }));

    expect(openSettings).toHaveBeenCalled();
    expect(
      await screen.findByText("We couldn't open Settings. Open them from your home screen instead."),
    ).toBeOnTheScreen();
  });

  it('reports an unavailable position (services off) with a retry that recovers', async () => {
    const { location, user } = await setup((location) => {
      location.permission = 'granted';
      location.position = err(new AppError('locationUnavailable', 'services off'));
    });

    expect(
      await screen.findByText("We couldn't determine the location. Check that location services are turned on."),
    ).toBeOnTheScreen();

    location.position = ok({ latitude: 38.72, longitude: -9.14 });
    await user.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByLabelText('Your location: 15°, Partly cloudy')).toBeOnTheScreen();
  });
});

describe('TripWeatherScreen', () => {
  async function setupFullScreen(configure?: (location: FakeDeviceLocationService) => void) {
    const httpClientFactory = new FakeHttpClientFactory();
    stubWeatherApi(httpClientFactory);
    const location = new FakeDeviceLocationService();
    configure?.(location);
    await renderWithProviders(<TripWeatherScreen />, {
      dependencies: { httpClientFactory, deviceLocationService: location, clock: new ManualClock(WEATHER_NOW) },
    });
    return { location, user: userEvent.setup() };
  }

  it('asks the system only once when "Use my location" is tapped again while the prompt is coming up', async () => {
    let answer: (permission: 'granted') => void = () => undefined;
    const { location, user } = await setupFullScreen((location) =>
      location.requestPermission.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            answer = (permission) => {
              location.permission = permission;
              resolve(permission);
            };
          }),
      ),
    );

    const allow = await screen.findByRole('button', { name: 'Use my location' });
    await user.press(allow);
    await user.press(allow);
    expect(location.requestPermission).toHaveBeenCalledTimes(1);

    await act(async () => answer('granted'));
    expect(await screen.findByLabelText('Your location: 15°, Partly cloudy')).toBeOnTheScreen();
  });

  it('says so when Settings cannot be opened', async () => {
    jest.spyOn(Linking, 'openSettings').mockRejectedValueOnce(new Error('no settings'));
    const { user } = await setupFullScreen((location) => (location.permission = 'blocked'));

    await user.press(await screen.findByRole('button', { name: 'Open Settings' }));

    expect(
      await screen.findByText(/We couldn't open Settings\. Open them from your home screen instead\./),
    ).toBeOnTheScreen();
  });
});
