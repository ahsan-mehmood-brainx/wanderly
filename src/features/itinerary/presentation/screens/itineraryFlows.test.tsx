import { fireEvent, userEvent } from '@testing-library/react-native';
import { router, Stack } from 'expo-router';
import { act, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';

import ActivityRoute from '@/app/(app)/(tabs)/trips/[tripId]/itinerary/[itemId]';
import EditActivityRoute from '@/app/(app)/(tabs)/trips/[tripId]/itinerary/[itemId]/edit';
import ItineraryDayRoute from '@/app/(app)/(tabs)/trips/[tripId]/itinerary/day/[date]';
import ItineraryRoute from '@/app/(app)/(tabs)/trips/[tripId]/itinerary/index';
import NewActivityRoute from '@/app/(app)/(tabs)/trips/[tripId]/itinerary/new';
import TripRoute from '@/app/(app)/(tabs)/trips/[tripId]/index';
import { AppProviders } from '@/bootstrap/AppProviders';
import { type AppDependencies } from '@/core/di/AppDependencies';
import { AppError } from '@/core/errors/AppError';
import { createI18n } from '@/core/i18n/createI18n';
import { err } from '@/core/result';
import { type Activity } from '@/features/itinerary/domain/Activity';
import { type StoredTrip } from '@/features/trips/domain/Trip';
import { createTestStore } from '@/testing/createTestStore';
import { FakeConnectivityService, OFFLINE } from '@/testing/FakeConnectivityService';
import { FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { activity, seededItineraryDatabase } from '@/testing/itineraryFixtures';
import { ManualClock } from '@/testing/ManualClock';
import { createTestDependencies } from '@/testing/testDependencies';
import { OTHER_TRIP_OWNER, storedTrip, TRIP_OWNER, TRIPS_NOW } from '@/testing/tripFixtures';

const lisbon = storedTrip({ id: 'lisbon', title: 'Lisbon getaway', startDate: '2027-07-01', endDate: '2027-07-03' });
const DAY_1 = '2027-07-01';

const tower = activity({
  id: 'tower',
  tripId: 'lisbon',
  title: 'Belém Tower',
  date: DAY_1,
  startTime: '09:00',
  endTime: '10:30',
  address: 'Av. Brasília',
  notes: 'Buy tickets online',
  estimatedCost: 1000,
  currency: 'EUR',
  sortOrder: 0,
});
const lunch = activity({
  id: 'lunch',
  tripId: 'lisbon',
  title: 'Lunch',
  category: 'food',
  date: DAY_1,
  startTime: '10:00',
  endTime: '12:00',
  estimatedCost: 3550,
  currency: 'USD',
  sortOrder: 1,
});
const tram = activity({
  id: 'tram',
  tripId: 'lisbon',
  title: 'Tram 28',
  category: 'transportation',
  date: '2027-07-03',
  startTime: null,
  endTime: null,
  estimatedCost: 1000,
  currency: 'USD',
  sortOrder: 0,
  isCompleted: true,
});

async function launch(
  activities: readonly Activity[],
  initialUrl: string,
  { trips = [lisbon], overrides = {} }: { trips?: readonly StoredTrip[]; overrides?: Partial<AppDependencies> } = {},
) {
  const storage = await seededItineraryDatabase(trips, activities);
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
      'trips/[tripId]/index': TripRoute,
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

type User = ReturnType<typeof userEvent.setup>;

async function savedActivities(repository: Awaited<ReturnType<typeof launch>>['activityRepository']) {
  const result = await repository.listByTrip(TRIP_OWNER, 'lisbon');
  if (!result.ok) throw result.error;
  return result.value;
}

const button = (name: string | RegExp) => screen.findByRole('button', { name });
const row = (id: string) => screen.findByTestId(`activity-row-${id}`);
const rowIds = () => screen.getAllByTestId(/^activity-row-/).map((node) => node.props.testID);

/** Picks a time in the time sheet: hour chips are `HH` (24-hour) and minute chips `:mm`. */
async function chooseTime(user: User, field: 'start' | 'end', hour: string, minute: string) {
  await user.press(screen.getByTestId(`activity-${field}-time-field`));
  const sheet = await screen.findByTestId('time-sheet');
  await user.press(within(sheet).getByRole('button', { name: hour }));
  await user.press(within(sheet).getByRole('button', { name: minute }));
  await user.press(within(sheet).getByRole('button', { name: 'Set time' }));
}

async function openAddActivityFromEmptyDay(user: User) {
  const [add] = await screen.findAllByRole('button', { name: 'Add activity' });
  if (!add) throw new Error('No "Add activity" button');
  await user.press(add);
  await screen.findByLabelText('Activity name');
}

describe('Itinerary Overview', () => {
  it('lists every trip day, with an empty-day message, counts, time spans and conflicts', async () => {
    await launch([tower, lunch, tram], '/trips/lisbon/itinerary');

    const day1 = await screen.findByTestId(`itinerary-day-${DAY_1}`);
    expect(within(day1).getByText(/^Day 1 · /)).toBeOnTheScreen();
    expect(within(day1).getByText(/2 activities/)).toBeOnTheScreen();
    expect(within(day1).getByText(/0?9:00.*12:00/)).toBeOnTheScreen();
    expect(within(day1).getByText('Time conflict')).toBeOnTheScreen();

    const day2 = screen.getByTestId('itinerary-day-2027-07-02');
    expect(within(day2).getByText(/^Day 2 · /)).toBeOnTheScreen();
    expect(within(day2).getByText('Nothing planned yet')).toBeOnTheScreen();

    const day3 = screen.getByTestId('itinerary-day-2027-07-03');
    expect(within(day3).getByText(/1 activity/)).toBeOnTheScreen();
    expect(within(day3).queryByText('Time conflict')).toBeNull();
    expect(screen.queryByTestId('itinerary-day-2027-07-04')).toBeNull();
  });

  it('shows completion progress and estimated costs per currency', async () => {
    await launch([tower, lunch, tram], '/trips/lisbon/itinerary');

    expect(await screen.findByText('1 of 3 done')).toBeOnTheScreen();
    expect(screen.getByRole('progressbar')).toHaveAccessibilityValue({ min: 0, max: 100, now: 33 });
    expect(screen.getByText('$45.50')).toBeOnTheScreen();
    expect(screen.getByText('€10.00')).toBeOnTheScreen();
  });

  it('says when nothing is planned at all', async () => {
    await launch([], '/trips/lisbon/itinerary');

    expect(await screen.findByText('0 of 0 done')).toBeOnTheScreen();
    expect(screen.getAllByText('Nothing planned yet')).toHaveLength(3);
  });

  it('opens a day', async () => {
    const { user } = await launch([tower], '/trips/lisbon/itinerary');

    await user.press(await screen.findByTestId(`itinerary-day-${DAY_1}`));

    expect(await screen.findByTestId('daily-itinerary')).toBeOnTheScreen();
    expect(await row('tower')).toBeOnTheScreen();
  });

  it('keeps activities that fall outside edited trip dates in their own section', async () => {
    const stray = activity({ id: 'stray', tripId: 'lisbon', title: 'Sintra day trip', date: '2027-06-28' });
    await launch([tower, stray], '/trips/lisbon/itinerary');

    const outside = await screen.findByTestId('itinerary-outside-trip');
    expect(within(outside).getByText('Outside trip dates')).toBeOnTheScreen();
    expect(within(outside).getByText('Sintra day trip')).toBeOnTheScreen();
    expect(within(screen.getByTestId(`itinerary-day-${DAY_1}`)).queryByText('Sintra day trip')).toBeNull();
  });

  it('says when the trip does not exist', async () => {
    await launch([], '/trips/gone/itinerary', { trips: [] });
    expect(await screen.findByText('Trip not found')).toBeOnTheScreen();
  });

  it('shows a storage failure with a retry that recovers', async () => {
    const storage = await seededItineraryDatabase([lisbon], [tower]);
    const working = createTestDependencies({ database: storage.database });
    const getItinerary = {
      execute: jest
        .fn()
        .mockResolvedValueOnce(err(new AppError('storage', 'locked')))
        .mockImplementation((tripId: string) => working.getItinerary.execute(tripId)),
    };
    const { user } = await launch([], '/trips/lisbon/itinerary', { overrides: { getItinerary } });

    expect(await screen.findByText("We couldn't access data saved on this device.")).toBeOnTheScreen();
    await user.press(await button('Try again'));
    expect(await screen.findByText('Belém Tower')).toBeOnTheScreen();
  });
});

describe('Daily Itinerary', () => {
  it('shows the day as a timeline with times, durations and overlaps', async () => {
    await launch([tower, lunch], `/trips/lisbon/itinerary/day/${DAY_1}`);

    const towerRow = await row('tower');
    expect(rowIds()).toEqual(['activity-row-tower', 'activity-row-lunch']);
    expect(within(towerRow).getByText(/^0?9:00.*10:30.* · 1 h 30 min$/)).toBeOnTheScreen();
    expect(within(towerRow).getByText('Overlaps with Lunch')).toBeOnTheScreen();
    expect(within(await row('lunch')).getByText('Overlaps with Belém Tower')).toBeOnTheScreen();
  });

  it('invites the traveller to plan an empty day', async () => {
    await launch([], '/trips/lisbon/itinerary/day/2027-07-02');

    expect(await screen.findByText('Nothing planned yet')).toBeOnTheScreen();
    expect((await screen.findAllByRole('button', { name: 'Add activity' })).length).toBeGreaterThan(0);
  });

  it('marks an activity done, updating the day and the overview progress', async () => {
    const { user, activityRepository } = await launch([tower, lunch], '/trips/lisbon/itinerary');
    expect(await screen.findByText('0 of 2 done')).toBeOnTheScreen();
    await user.press(screen.getByTestId(`itinerary-day-${DAY_1}`));

    const checkbox = within(await row('tower')).getByRole('checkbox');
    await user.press(checkbox);

    await waitFor(() => expect(within(screen.getByTestId('activity-row-tower')).getByRole('checkbox')).toBeChecked());
    expect(await screen.findByText('1 of 2 done')).toBeOnTheScreen();
    expect((await savedActivities(activityRepository)).find(({ id }) => id === 'tower')?.isCompleted).toBe(true);

    await act(async () => router.back());
    expect(await screen.findByText('1 of 2 done')).toBeOnTheScreen();
  });

  it('reorders with the Move down action and keeps the order after a reload', async () => {
    const { activityRepository, database } = await launch([tower, lunch], `/trips/lisbon/itinerary/day/${DAY_1}`);

    fireEvent(await row('tower'), 'accessibilityAction', { nativeEvent: { actionName: 'moveDown' } });

    await waitFor(() => expect(rowIds()).toEqual(['activity-row-lunch', 'activity-row-tower']));
    await waitFor(async () =>
      expect((await savedActivities(activityRepository)).map(({ id, sortOrder }) => [id, sortOrder])).toEqual([
        ['lunch', 0],
        ['tower', 1],
      ]),
    );
    const reloaded = await createTestDependencies({ database }).getItinerary.execute('lisbon');
    expect(reloaded.ok && reloaded.value.map(({ id }) => id)).toEqual(['lunch', 'tower']);
  });

  it('puts the order back and explains when saving it fails', async () => {
    const { dependencies, activityRepository } = await launch([tower, lunch], `/trips/lisbon/itinerary/day/${DAY_1}`);
    jest
      .spyOn(dependencies.activityRepository, 'reorder')
      .mockResolvedValueOnce(err(new AppError('storage', 'disk full')));

    fireEvent(await row('tower'), 'accessibilityAction', { nativeEvent: { actionName: 'moveDown' } });

    expect(await screen.findByText("We couldn't access data saved on this device.")).toBeOnTheScreen();
    expect(rowIds()).toEqual(['activity-row-tower', 'activity-row-lunch']);
    expect((await savedActivities(activityRepository)).map(({ id }) => id)).toEqual(['tower', 'lunch']);
  });

  it('says when the trip does not exist', async () => {
    await launch([], `/trips/gone/itinerary/day/${DAY_1}`, { trips: [] });
    expect(await screen.findByText('Trip not found')).toBeOnTheScreen();
  });
});

describe('Add Activity', () => {
  it('adds an activity to the chosen day in SQLite and shows it on the timeline', async () => {
    const { user, activityRepository, database } = await launch([], `/trips/lisbon/itinerary/day/${DAY_1}`);
    await openAddActivityFromEmptyDay(user);

    await user.type(screen.getByLabelText('Activity name'), 'Jerónimos Monastery');
    await user.press(screen.getByRole('button', { name: 'Sightseeing' }));
    await chooseTime(user, 'start', '09', ':00');
    await chooseTime(user, 'end', '10', ':30');
    await user.type(screen.getByLabelText('Address'), 'Praça do Império');
    await user.type(screen.getByLabelText('Notes'), 'Closed on Mondays');
    await user.type(screen.getByLabelText('Estimated cost'), '25.50');
    await user.press(await button('Save activity'));

    const saved = await screen.findByText('Jerónimos Monastery');
    expect(await screen.findByTestId('daily-itinerary')).toBeOnTheScreen();
    expect(saved).toBeOnTheScreen();
    expect(screen.getByText(/^0?9:00.*10:30.* · 1 h 30 min$/)).toBeOnTheScreen();
    expect(screen.getByText('$25.50')).toBeOnTheScreen();

    const expected = {
      tripId: 'lisbon',
      title: 'Jerónimos Monastery',
      category: 'sightseeing',
      date: DAY_1,
      startTime: '09:00',
      endTime: '10:30',
      address: 'Praça do Império',
      notes: 'Closed on Mondays',
      estimatedCost: 2550,
      currency: 'USD',
      sortOrder: 0,
      isCompleted: false,
    };
    expect(await savedActivities(activityRepository)).toEqual([expect.objectContaining(expected)]);
    const reloaded = await createTestDependencies({ database }).getItinerary.execute('lisbon');
    expect(reloaded.ok && reloaded.value).toEqual([expect.objectContaining(expected)]);
  });

  it('shows what is wrong inline and saves nothing', async () => {
    const { user, activityRepository } = await launch([], `/trips/lisbon/itinerary/day/${DAY_1}`);
    await openAddActivityFromEmptyDay(user);

    await chooseTime(user, 'start', '11', ':00');
    await chooseTime(user, 'end', '10', ':00');
    await user.type(screen.getByLabelText('Estimated cost'), '12.345');
    await user.press(await button('Save activity'));

    expect(await screen.findByText('Give the activity a name.')).toBeOnTheScreen();
    expect(screen.getByText('Choose a category.')).toBeOnTheScreen();
    expect(screen.getByText('The end time must be after the start time.')).toBeOnTheScreen();
    expect(screen.getByText('Use at most 2 decimal places.')).toBeOnTheScreen();
    expect(await savedActivities(activityRepository)).toEqual([]);
  });

  it('refuses an exact duplicate and names the activity already planned', async () => {
    const { user, activityRepository } = await launch([tower], `/trips/lisbon/itinerary/new?date=${DAY_1}`);

    await user.type(await screen.findByLabelText('Activity name'), ' belém tower ');
    await user.press(screen.getByRole('button', { name: 'Sightseeing' }));
    await chooseTime(user, 'start', '09', ':00');
    await user.press(await button('Save activity'));

    expect(await screen.findByText(/already have "Belém Tower"/)).toBeOnTheScreen();
    expect(await savedActivities(activityRepository)).toHaveLength(1);
  });

  it('warns about an overlap while editing, then saves the activity anyway', async () => {
    const { user, activityRepository } = await launch([tower], `/trips/lisbon/itinerary/new?date=${DAY_1}`);

    await user.type(await screen.findByLabelText('Activity name'), 'Pastéis de Belém');
    await user.press(screen.getByRole('button', { name: 'Food' }));
    await chooseTime(user, 'start', '10', ':00');
    await chooseTime(user, 'end', '11', ':00');

    expect(await screen.findByText(/Overlaps with Belém Tower/)).toBeOnTheScreen();
    await user.press(await button('Save activity'));

    await waitFor(async () => expect(await savedActivities(activityRepository)).toHaveLength(2));
  });

  it('works offline; only place search needs a connection', async () => {
    const { user, activityRepository } = await launch([], `/trips/lisbon/itinerary/day/${DAY_1}`, {
      overrides: { connectivity: new FakeConnectivityService(OFFLINE) },
    });
    await openAddActivityFromEmptyDay(user);

    expect(screen.getByText('Search needs a connection')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Search places' })).toBeDisabled();

    await user.type(screen.getByLabelText('Activity name'), 'Fado night');
    await user.press(screen.getByRole('button', { name: 'Entertainment' }));
    await user.type(screen.getByLabelText('Address'), 'Alfama');
    await user.press(await button('Save activity'));

    expect(await screen.findByText('Fado night')).toBeOnTheScreen();
    expect(await savedActivities(activityRepository)).toEqual([
      expect.objectContaining({ title: 'Fado night', category: 'entertainment', address: 'Alfama' }),
    ]);
  });
});

describe('Activity Details', () => {
  it('shows the activity with its overlap warning', async () => {
    await launch([tower, lunch], '/trips/lisbon/itinerary/tower');

    const details = await screen.findByTestId('activity-details');
    expect(within(details).getByText('Belém Tower')).toBeOnTheScreen();
    expect(within(details).getByText(/0?9:00.*10:30/)).toBeOnTheScreen();
    expect(within(details).getByText('Av. Brasília')).toBeOnTheScreen();
    expect(within(details).getByText('Buy tickets online')).toBeOnTheScreen();
    expect(within(details).getByText('€10.00')).toBeOnTheScreen();
    expect(within(details).getByText('Overlaps with Lunch')).toBeOnTheScreen();
  });

  it('marks the activity done and back', async () => {
    const { user, activityRepository } = await launch([tower], '/trips/lisbon/itinerary/tower');

    await user.press(await button('Mark as done'));
    expect(await button('Mark as not done')).toBeOnTheScreen();
    expect((await savedActivities(activityRepository))[0]?.isCompleted).toBe(true);

    await user.press(await button('Mark as not done'));
    expect(await button('Mark as done')).toBeOnTheScreen();
    expect((await savedActivities(activityRepository))[0]?.isCompleted).toBe(false);
  });

  it('deletes only after confirmation, then goes back to the day', async () => {
    const { user, activityRepository } = await launch([tower, lunch], `/trips/lisbon/itinerary/day/${DAY_1}`);
    await user.press(within(await row('tower')).getByText('Belém Tower'));

    await user.press(await button('Delete activity'));
    expect(await screen.findByText('Delete this activity?')).toBeOnTheScreen();
    await user.press(await button('Keep activity'));
    expect(await savedActivities(activityRepository)).toHaveLength(2);

    await user.press(await button('Delete activity'));
    await user.press(await button('Delete'));

    expect(await screen.findByTestId('daily-itinerary')).toBeOnTheScreen();
    await waitFor(() => expect(rowIds()).toEqual(['activity-row-lunch']));
    expect((await savedActivities(activityRepository)).map(({ id }) => id)).toEqual(['lunch']);
  });

  it('says when the activity does not exist, with a way back to the itinerary', async () => {
    const { user } = await launch([], '/trips/lisbon/itinerary/gone');

    expect(await screen.findByText('Activity not found')).toBeOnTheScreen();
    await user.press(await button('Back to itinerary'));
    expect(await screen.findByTestId(`itinerary-day-${DAY_1}`)).toBeOnTheScreen();
  });

  it("treats another account's activity as not found", async () => {
    const storage = await seededItineraryDatabase([], []);
    await storage.tripRepository.insert(OTHER_TRIP_OWNER, storedTrip({ id: 'theirs' }));
    await storage.activityRepository.insert(OTHER_TRIP_OWNER, activity({ id: 'secret', tripId: 'theirs' }));
    await launch([], '/trips/theirs/itinerary/secret', { trips: [], overrides: { database: storage.database } });

    expect((await screen.findAllByText(/not found/)).length).toBeGreaterThan(0);
    expect(screen.queryByText('Belém Tower')).toBeNull();
  });

  it('says when the trip is gone', async () => {
    await launch([], '/trips/gone/itinerary/tower', { trips: [] });
    expect((await screen.findAllByText(/not found/)).length).toBeGreaterThan(0);
  });
});

describe('Edit Activity', () => {
  it('starts from the saved activity and stores the change', async () => {
    const { user, activityRepository } = await launch([tower], '/trips/lisbon/itinerary/tower');
    await user.press(await button('Edit activity'));

    const title = await screen.findByLabelText('Activity name');
    expect(title.props.value).toBe('Belém Tower');
    expect(screen.getByLabelText('Address').props.value).toBe('Av. Brasília');
    expect(screen.getByLabelText('Notes').props.value).toBe('Buy tickets online');
    expect(screen.getByLabelText('Estimated cost').props.value).toBe('10');
    expect(screen.getByRole('button', { name: 'Sightseeing' })).toBeSelected();

    await user.clear(title);
    await user.type(title, 'Torre de Belém');
    await user.press(await button('Save changes'));

    expect(await screen.findByTestId('activity-details')).toBeOnTheScreen();
    expect(await screen.findByText('Torre de Belém')).toBeOnTheScreen();
    expect((await savedActivities(activityRepository))[0]).toMatchObject({
      title: 'Torre de Belém',
      address: 'Av. Brasília',
      estimatedCost: 1000,
      currency: 'EUR',
    });
  });

  it('requires an activity outside the trip dates to move into the trip', async () => {
    const stray = activity({ id: 'stray', tripId: 'lisbon', title: 'Sintra day trip', date: '2027-06-28' });
    const { user, activityRepository } = await launch([stray], '/trips/lisbon/itinerary/stray/edit');

    await user.press(await button('Save changes'));

    expect(await screen.findByText(/within the trip/)).toBeOnTheScreen();
    expect((await savedActivities(activityRepository))[0]?.date).toBe('2027-06-28');
  });

  it('says when the activity no longer exists', async () => {
    await launch([], '/trips/lisbon/itinerary/gone/edit');
    expect(await screen.findByText('Activity not found')).toBeOnTheScreen();
  });
});

describe('Trip Details entry', () => {
  it('shows itinerary progress and opens the itinerary', async () => {
    const { user } = await launch([tower, lunch, tram], '/trips/lisbon');

    const entry = await button(/Itinerary/);
    expect(within(entry).getByText('1 of 3 done')).toBeOnTheScreen();
    await user.press(entry);

    expect(await screen.findByTestId(`itinerary-day-${DAY_1}`)).toBeOnTheScreen();
  });
});
