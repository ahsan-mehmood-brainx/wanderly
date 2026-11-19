import { userEvent } from '@testing-library/react-native';
import { router, Stack } from 'expo-router';
import { act, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Linking } from 'react-native';

import ActivityRoute from '@/app/(app)/(tabs)/trips/[tripId]/itinerary/[itemId]';
import EditActivityRoute from '@/app/(app)/(tabs)/trips/[tripId]/itinerary/[itemId]/edit';
import ItineraryDayRoute from '@/app/(app)/(tabs)/trips/[tripId]/itinerary/day/[date]';
import ItineraryRoute from '@/app/(app)/(tabs)/trips/[tripId]/itinerary/index';
import NewActivityRoute from '@/app/(app)/(tabs)/trips/[tripId]/itinerary/new';
import { AppProviders } from '@/bootstrap/AppProviders';
import { type AppDependencies } from '@/core/di/AppDependencies';
import { AppError } from '@/core/errors/AppError';
import { createI18n } from '@/core/i18n/createI18n';
import { err } from '@/core/result';
import { type Activity } from '@/features/itinerary/domain/Activity';
import { createTestStore } from '@/testing/createTestStore';
import { FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { FakeLocationService } from '@/testing/FakeLocationService';
import { activity, seededItineraryDatabase } from '@/testing/itineraryFixtures';
import { ManualClock } from '@/testing/ManualClock';
import { createTestDependencies } from '@/testing/testDependencies';
import { storedTrip, TRIP_OWNER, TRIPS_NOW } from '@/testing/tripFixtures';

const lisbon = storedTrip({ id: 'lisbon', title: 'Lisbon getaway', startDate: '2027-07-01', endDate: '2027-07-03' });
const DAY_1 = '2027-07-01';
const BEFORE_TRIP = '2027-06-30';

const tower = activity({
  id: 'tower',
  tripId: 'lisbon',
  title: 'Belém Tower',
  date: DAY_1,
  startTime: '09:00',
  endTime: '10:30',
  latitude: 38.6916,
  longitude: -9.216,
  sortOrder: 0,
});

async function launch(activities: readonly Activity[], initialUrl: string, overrides: Partial<AppDependencies> = {}) {
  const storage = await seededItineraryDatabase([lisbon], activities);
  const dependencies = createTestDependencies({
    database: storage.database,
    clock: new ManualClock(TRIPS_NOW),
    httpClientFactory: new FakeHttpClientFactory(),
    ...overrides,
  });
  const container = { dependencies, store: createTestStore(dependencies), i18n: createI18n('en') };
  await renderRouter(
    {
      _layout: () => (
        <AppProviders container={container}>
          <Stack screenOptions={{ headerShown: false }} />
        </AppProviders>
      ),
      'trips/[tripId]/itinerary/index': ItineraryRoute,
      'trips/[tripId]/itinerary/day/[date]': ItineraryDayRoute,
      'trips/[tripId]/itinerary/new': NewActivityRoute,
      'trips/[tripId]/itinerary/[itemId]': ActivityRoute,
      'trips/[tripId]/itinerary/[itemId]/edit': EditActivityRoute,
    },
    { initialUrl },
  );
  return { ...storage, dependencies, user: userEvent.setup() };
}

const button = (name: string | RegExp) => screen.findByRole('button', { name });

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Daily Itinerary edge cases', () => {
  it('opens a day outside the trip with a warning and no day-to-day navigation', async () => {
    await launch([], `/trips/lisbon/itinerary/day/${BEFORE_TRIP}`);

    expect(await screen.findByText('This day is outside the trip dates.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Previous day' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled();
  });

  it('cannot go before the first trip day, and steps to the next day', async () => {
    const { user } = await launch([], `/trips/lisbon/itinerary/day/${DAY_1}`);

    expect(await screen.findByText(/^Day 1 · /)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Previous day' })).toBeDisabled();

    await user.press(screen.getByRole('button', { name: 'Next day' }));

    expect(await screen.findByText(/^Day 2 · /)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Previous day' })).toBeEnabled();
  });

  it('cannot go past the last trip day', async () => {
    await launch([], '/trips/lisbon/itinerary/day/2027-07-03');

    expect(await screen.findByText(/^Day 3 · /)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled();
  });

  it('shows the invalid-link view for a day that is not a calendar date', async () => {
    await launch([], '/trips/lisbon/itinerary/day/2027-02-30');
    expect(await screen.findByText("This link isn't valid")).toBeOnTheScreen();
  });
});

describe('Add Activity edge cases', () => {
  it('does not preselect a day outside the trip when adding from that day', async () => {
    await launch([], `/trips/lisbon/itinerary/new?date=${BEFORE_TRIP}`);

    await screen.findByLabelText('Activity name');
    expect(screen.getByText('Choose a day')).toBeOnTheScreen();
  });

  it('ignores a malformed preset day', async () => {
    await launch([], '/trips/lisbon/itinerary/new?date=tomorrow');

    await screen.findByLabelText('Activity name');
    expect(screen.getByText('Choose a day')).toBeOnTheScreen();
  });

  it('asks for location again after an earlier denial that can still be asked', async () => {
    const location = new FakeLocationService();
    location.permission = 'denied';
    location.answerPromptWith = 'granted';
    const { user } = await launch([], `/trips/lisbon/itinerary/new?date=${DAY_1}`, { mapLocationService: location });

    await screen.findByLabelText('Activity name');
    await user.press(screen.getByRole('button', { name: 'Use current location' }));

    expect(await screen.findByText(/^Pinned at /)).toBeOnTheScreen();
    expect(location.requestPermission).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Allow location access in Settings to use where you are.')).toBeNull();
  });

  it('explains a blocked location permission without asking again', async () => {
    const location = new FakeLocationService();
    location.permission = 'blocked';
    const { user } = await launch([], `/trips/lisbon/itinerary/new?date=${DAY_1}`, { mapLocationService: location });

    await screen.findByLabelText('Activity name');
    await user.press(screen.getByRole('button', { name: 'Use current location' }));

    expect(await screen.findByText('Allow location access in Settings to use where you are.')).toBeOnTheScreen();
    expect(location.requestPermission).not.toHaveBeenCalled();
    expect(screen.queryByText(/^Pinned at /)).toBeNull();
  });

  it('asks before discarding unsaved edits, keeps them on Keep editing and leaves on Discard', async () => {
    const { user, activityRepository } = await launch([], `/trips/lisbon/itinerary/day/${DAY_1}`);
    await act(async () => router.push(`/trips/lisbon/itinerary/new?date=${DAY_1}`));
    await user.type(await screen.findByLabelText('Activity name'), 'Draft');

    await act(async () => router.back());
    expect(await screen.findByText('Discard your changes?')).toBeOnTheScreen();
    await user.press(await button('Keep editing'));
    expect(screen.getByLabelText('Activity name')).toHaveDisplayValue('Draft');

    await act(async () => router.back());
    await user.press(await button('Discard'));

    expect(await screen.findByTestId('daily-itinerary')).toBeOnTheScreen();
    const saved = await activityRepository.listByTrip(TRIP_OWNER, 'lisbon');
    expect(saved.ok && saved.value).toEqual([]);
  });
});

describe('Activity Details edge cases', () => {
  it('explains when no maps app can open the location', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('No app can open it'));
    const { user } = await launch([tower], '/trips/lisbon/itinerary/tower');

    await user.press(await button('Open in Maps'));

    expect(await screen.findByText("We couldn't open a maps app.")).toBeOnTheScreen();
    expect(openURL).toHaveBeenCalled();
  });

  it('keeps the activity on screen and explains when deleting it fails', async () => {
    const { user, dependencies, activityRepository } = await launch([tower], '/trips/lisbon/itinerary/tower');
    jest
      .spyOn(dependencies.activityRepository, 'delete')
      .mockResolvedValueOnce(err(new AppError('storage', 'disk full')));

    await user.press(await button('Delete activity'));
    await user.press(await button('Delete'));

    expect(await screen.findByText("We couldn't access data saved on this device.")).toBeOnTheScreen();
    expect(screen.getByTestId('activity-details')).toBeOnTheScreen();
    await waitFor(async () => {
      const saved = await activityRepository.listByTrip(TRIP_OWNER, 'lisbon');
      expect(saved.ok && saved.value.map(({ id }) => id)).toEqual(['tower']);
    });
  });
});
