import { userEvent } from '@testing-library/react-native';
import { router, Stack } from 'expo-router';
import { act, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';

import CompletedTripsRoute from '@/app/(app)/(tabs)/trips/completed';
import EditTripRoute from '@/app/(app)/(tabs)/trips/[tripId]/edit';
import TripRoute from '@/app/(app)/(tabs)/trips/[tripId]/index';
import TripsRoute from '@/app/(app)/(tabs)/trips/index';
import NewTripRoute from '@/app/(app)/(tabs)/trips/new';
import UpcomingTripsRoute from '@/app/(app)/(tabs)/trips/upcoming';
import { AppProviders } from '@/bootstrap/AppProviders';
import { type AppDependencies } from '@/core/di/AppDependencies';
import { AppError } from '@/core/errors/AppError';
import { createI18n } from '@/core/i18n/createI18n';
import { err, ok } from '@/core/result';
import { type StoredTrip } from '@/features/trips/domain/Trip';
import { createTestStore } from '@/testing/createTestStore';
import { FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { ManualClock } from '@/testing/ManualClock';
import { createTestDependencies } from '@/testing/testDependencies';
import {
  FakeImagePickerService,
  FakeTripCoverStore,
  seededTripDatabase,
  storedTrip,
  TRIP_OWNER,
  TRIPS_NOW,
} from '@/testing/tripFixtures';

const lisbon = storedTrip({ id: 'lisbon', title: 'Lisbon getaway' });

async function launch(
  trips: readonly StoredTrip[] = [],
  initialUrl = '/trips',
  overrides: Partial<AppDependencies> = {},
) {
  const storage = await seededTripDatabase(trips);
  const covers = new FakeTripCoverStore();
  const picker = new FakeImagePickerService();
  const dependencies = createTestDependencies({
    database: storage.database,
    tripCoverStore: covers,
    imagePickerService: picker,
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
      'trips/index': TripsRoute,
      'trips/new': NewTripRoute,
      'trips/upcoming': UpcomingTripsRoute,
      'trips/completed': CompletedTripsRoute,
      'trips/[tripId]/index': TripRoute,
      'trips/[tripId]/edit': EditTripRoute,
    },
    { initialUrl },
  );
  return { ...storage, covers, picker, dependencies, user: userEvent.setup() };
}

const savedTrips = async (repository: Awaited<ReturnType<typeof launch>>['repository']) => {
  const result = await repository.list(TRIP_OWNER);
  if (!result.ok) throw result.error;
  return result.value;
};

const button = (name: string | RegExp) => screen.findByRole('button', { name });

async function chooseDestination(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.press(await screen.findByTestId('trip-destination-field'));
  await user.press(await button(name));
}

/** Picks two days in the calendar's current month (June 2027, as "today" is 15 June). */
async function chooseDates(user: ReturnType<typeof userEvent.setup>, first: number, last: number) {
  await user.press(await screen.findByTestId('trip-dates-field'));
  await user.press(await button(new RegExp(`June ${first}, 2027`)));
  await user.press(await button(new RegExp(`June ${last}, 2027`)));
  await user.press(await button('Use these dates'));
}

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Trip name'), 'Kyoto in June');
  await chooseDestination(user, 'Kyoto');
  await chooseDates(user, 20, 24);
  await user.type(screen.getByLabelText('Total budget'), '2500.50');
}

describe('My Trips', () => {
  it('invites the traveller to plan a first trip', async () => {
    await launch();
    expect(await screen.findByText('No trips yet')).toBeOnTheScreen();
    expect(await button('Plan a trip')).toBeOnTheScreen();
  });

  it('groups trips by status worked out from today', async () => {
    await launch([
      storedTrip({ id: 'now', title: 'Now', startDate: '2027-06-10', endDate: '2027-06-20' }),
      storedTrip({ id: 'next', title: 'Next', startDate: '2027-07-01', endDate: '2027-07-02' }),
      storedTrip({ id: 'past', title: 'Past', startDate: '2027-01-01', endDate: '2027-01-02' }),
      storedTrip({ id: 'off', title: 'Off', startDate: '2027-08-01', endDate: '2027-08-02', cancelledAt: 1 }),
    ]);

    expect(within(await screen.findByTestId('trips-ongoing')).getByText('Now')).toBeOnTheScreen();
    expect(within(screen.getByTestId('trips-ongoing')).getByText('Day 6 of 11')).toBeOnTheScreen();
    expect(within(screen.getByTestId('trips-upcoming')).getByText('Next')).toBeOnTheScreen();
    expect(within(screen.getByTestId('trips-completed')).getByText('Past')).toBeOnTheScreen();
    expect(within(screen.getByTestId('trips-cancelled')).getByText('Off')).toBeOnTheScreen();
  });

  it('shortens a long group and opens the full Upcoming Trips list', async () => {
    const trips = [1, 2, 3, 4].map((month) =>
      storedTrip({
        id: `u${month}`,
        title: `Trip ${month}`,
        startDate: `2028-0${month}-01`,
        endDate: `2028-0${month}-02`,
      }),
    );
    const { user } = await launch(trips);

    expect(await screen.findByText('Trip 3')).toBeOnTheScreen();
    expect(screen.queryByText('Trip 4')).toBeNull();

    await user.press(await button('See all Upcoming'));
    expect(await screen.findByTestId('trip-list-upcoming')).toBeOnTheScreen();
    expect(screen.getByText('Trip 4')).toBeOnTheScreen();
  });

  it('shows a storage failure with a retry that recovers', async () => {
    const storage = await seededTripDatabase([lisbon]);
    const failing = createTestDependencies({ database: storage.database });
    const getTrips = {
      execute: jest
        .fn()
        .mockResolvedValueOnce(err(new AppError('storage', 'locked')))
        .mockImplementation(() => failing.getTrips.execute()),
    };
    const { user } = await launch([], '/trips', { getTrips });

    expect(await screen.findByText("We couldn't access data saved on this device.")).toBeOnTheScreen();
    await user.press(await button('Try again'));
    expect(await screen.findByText('Lisbon getaway')).toBeOnTheScreen();
  });
});

describe('Upcoming and Completed Trips', () => {
  it('lists only completed trips, most recent first', async () => {
    await launch(
      [
        storedTrip({ id: 'a', title: 'Older', startDate: '2026-01-01', endDate: '2026-01-02' }),
        storedTrip({ id: 'b', title: 'Newer', startDate: '2027-01-01', endDate: '2027-01-02' }),
        lisbon,
      ],
      '/trips/completed',
    );
    const list = await screen.findByTestId('trip-list-completed');
    expect(
      within(list)
        .getAllByText(/Older|Newer/)
        .map((node) => node.props.children),
    ).toEqual(['Newer', 'Older']);
    expect(screen.queryByText('Lisbon getaway')).toBeNull();
  });

  it('explains an empty list', async () => {
    await launch([], '/trips/upcoming');
    expect(await screen.findByText('Nothing coming up')).toBeOnTheScreen();
  });
});

describe('Create Trip', () => {
  it('shows what is missing and saves nothing', async () => {
    const { user, repository } = await launch([], '/trips/new');
    await user.press(await button('Create trip'));

    expect(await screen.findByText('Give your trip a name.')).toBeOnTheScreen();
    expect(screen.getByText('Choose a destination.')).toBeOnTheScreen();
    expect(screen.getByText('Choose the start and end dates.')).toBeOnTheScreen();
    expect(screen.getByText('Enter a budget.')).toBeOnTheScreen();
    expect(await savedTrips(repository)).toEqual([]);
  });

  it('clears a field’s error as soon as it is edited', async () => {
    const { user } = await launch([], '/trips/new');
    await user.press(await button('Create trip'));
    await screen.findByText('Give your trip a name.');
    await user.type(screen.getByLabelText('Trip name'), 'K');
    await waitFor(() => expect(screen.queryByText('Give your trip a name.')).toBeNull());
  });

  it('creates a trip in SQLite and opens it', async () => {
    const { user, repository, picker, covers } = await launch([], '/trips/new');
    picker.result = ok('file:///picked/photo.jpg');

    await user.press(await button('Add cover photo'));
    expect(await screen.findByLabelText('Selected cover photo')).toBeOnTheScreen();
    await fillRequired(user);
    await user.type(screen.getByLabelText('Description'), 'Temples and tea');
    await user.press(await button('Create trip'));

    expect(await screen.findByTestId('trip-screen')).toBeOnTheScreen();
    expect(screen.getByText('Kyoto in June')).toBeOnTheScreen();
    expect(screen.getByText('$2,500.50')).toBeOnTheScreen();
    expect(screen.getByText('Starts in 5 days')).toBeOnTheScreen();
    expect(await savedTrips(repository)).toEqual([
      expect.objectContaining({
        title: 'Kyoto in June',
        destinationId: 'kyoto',
        destinationName: 'Kyoto',
        startDate: '2027-06-20',
        endDate: '2027-06-24',
        description: 'Temples and tea',
        budget: 250_050,
        currency: 'USD',
        coverImage: 'trip-covers/cover-1.jpg',
      }),
    ]);
    expect(covers.stored.size).toBe(1);
  });

  it('works with no connection, using a typed destination', async () => {
    const { user, repository } = await launch([], '/trips/new');
    await user.type(await screen.findByLabelText('Trip name'), 'Cabin');
    await user.press(screen.getByTestId('trip-destination-field'));
    await user.type(await screen.findByLabelText('Search destinations'), 'Grandma  house');
    await user.press(await button(/Use "Grandma house"/));
    await chooseDates(user, 20, 21);
    await user.type(screen.getByLabelText('Total budget'), '100');
    await user.press(await button('Create trip'));

    expect(await screen.findByTestId('trip-screen')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'View destination' })).toBeNull();
    expect((await savedTrips(repository))[0]).toMatchObject({
      destinationId: 'custom:grandma house',
      destinationName: 'Grandma house',
    });
  });

  it('refuses overlapping dates and names the trip in the way', async () => {
    const { user, repository } = await launch(
      [storedTrip({ id: 'rome', title: 'Rome', startDate: '2027-06-22', endDate: '2027-06-28' })],
      '/trips/new',
    );
    await fillRequired(user);
    await user.press(await button('Create trip'));

    expect(await screen.findByText('These dates overlap "Rome" (Jun 22 – Jun 28, 2027).')).toBeOnTheScreen();
    expect(await savedTrips(repository)).toHaveLength(1);
  });

  it('rejects an invalid budget', async () => {
    const { user } = await launch([], '/trips/new');
    await user.type(await screen.findByLabelText('Total budget'), '12.345');
    await user.press(await button('Create trip'));
    expect(await screen.findByText('Use at most 2 decimal places.')).toBeOnTheScreen();
  });

  it('uses the chosen currency’s rules', async () => {
    const { user } = await launch([], '/trips/new');
    await user.type(await screen.findByLabelText('Total budget'), '10.50');
    await user.press(screen.getByTestId('trip-currency-field'));
    await user.press(await button('JPY'));
    await user.press(await button('Create trip'));
    expect(await screen.findByText('JPY amounts have no decimals.')).toBeOnTheScreen();
  });

  it('says so when the photo library cannot open', async () => {
    const { user, picker } = await launch([], '/trips/new');
    picker.result = err(new AppError('unknown', 'nope'));
    await user.press(await button('Add cover photo'));
    expect(await screen.findByText("We couldn't open your photos. Please try again.")).toBeOnTheScreen();
  });

  it('keeps the form and explains when saving fails', async () => {
    const { user, covers, picker } = await launch([], '/trips/new');
    covers.failImports = true;
    picker.result = ok('file:///picked/photo.jpg');
    await user.press(await button('Add cover photo'));
    await fillRequired(user);
    await user.press(await button('Create trip'));

    expect(await screen.findByText("We couldn't access data saved on this device.")).toBeOnTheScreen();
    expect(screen.getByLabelText('Trip name').props.value).toBe('Kyoto in June');
  });

  it('asks before discarding unsaved edits', async () => {
    const { user } = await launch([], '/trips');
    await act(async () => router.push('/trips/new'));
    await user.type(await screen.findByLabelText('Trip name'), 'Draft');

    await act(async () => router.back());
    expect(await screen.findByText('Discard your changes?')).toBeOnTheScreen();
    await user.press(await button('Keep editing'));
    expect(screen.getByLabelText('Trip name')).toBeOnTheScreen();

    await act(async () => router.back());
    await user.press(await button('Discard'));
    expect(await screen.findByText('No trips yet')).toBeOnTheScreen();
  });
});

describe('Edit Trip', () => {
  it('starts from the saved trip and stores the change', async () => {
    const { user, repository } = await launch([lisbon], '/trips/lisbon/edit');

    const title = await screen.findByLabelText('Trip name');
    expect(title.props.value).toBe('Lisbon getaway');
    expect(screen.getByLabelText('Total budget').props.value).toBe('1500');

    await user.clear(title);
    await user.type(title, 'Porto weekend');
    await user.press(await button('Save changes'));

    await waitFor(async () => expect((await savedTrips(repository))[0]?.title).toBe('Porto weekend'));
  });

  it('removes a cover when saved without it', async () => {
    const { user, covers, repository } = await launch(
      [{ ...lisbon, coverImage: 'trip-covers/old.jpg' }],
      '/trips/lisbon/edit',
    );
    await user.press(await button('Remove photo'));
    await user.press(await button('Save changes'));

    await waitFor(() => expect(covers.removed).toEqual(['trip-covers/old.jpg']));
    expect((await savedTrips(repository))[0]?.coverImage).toBeNull();
  });

  it('says when the trip no longer exists', async () => {
    await launch([], '/trips/gone/edit');
    expect(await screen.findByText('Trip not found')).toBeOnTheScreen();
  });
});

describe('Trip Details', () => {
  it('shows the trip', async () => {
    await launch([{ ...lisbon, description: 'Pastéis every day' }], '/trips/lisbon');

    expect(await screen.findByText('Lisbon getaway')).toBeOnTheScreen();
    expect(screen.getByText('Portugal')).toBeOnTheScreen();
    expect(screen.getByText('Jul 1 – Jul 5, 2027 · 5 days')).toBeOnTheScreen();
    expect(screen.getByText('$1,500.00')).toBeOnTheScreen();
    expect(screen.getByText('Pastéis every day')).toBeOnTheScreen();
    expect(screen.getByText('Upcoming')).toBeOnTheScreen();
    expect(await button('View destination')).toBeOnTheScreen();
  });

  it('says when the trip does not exist', async () => {
    await launch([], '/trips/nope');
    expect(await screen.findByTestId('trip-not-found')).toBeOnTheScreen();
  });

  it('deletes only after confirmation', async () => {
    const { user, repository, covers } = await launch([{ ...lisbon, coverImage: 'trip-covers/a.jpg' }], '/trips');
    await act(async () => router.push('/trips/lisbon'));

    await user.press(await button('Delete trip'));
    expect(await screen.findByText('Delete this trip?')).toBeOnTheScreen();
    await user.press(await button('Keep trip'));
    expect(await savedTrips(repository)).toHaveLength(1);

    await user.press(await button('Delete trip'));
    await user.press(await button('Delete'));

    expect(await screen.findByText('No trips yet')).toBeOnTheScreen();
    expect(await savedTrips(repository)).toEqual([]);
    expect(covers.removed).toEqual(['trip-covers/a.jpg']);
  });

  it('keeps the trip and explains when deletion fails', async () => {
    const { user, dependencies } = await launch([lisbon], '/trips/lisbon');
    jest.spyOn(dependencies.tripRepository, 'delete').mockResolvedValueOnce(err(new AppError('storage', 'locked')));

    await user.press(await button('Delete trip'));
    await user.press(await button('Delete'));

    expect(await screen.findByText("We couldn't access data saved on this device.")).toBeOnTheScreen();
    expect(screen.getByText('Lisbon getaway')).toBeOnTheScreen();
  });

  it('cancels after confirmation and can restore', async () => {
    const { user, repository } = await launch([lisbon], '/trips/lisbon');

    await user.press(await button('Cancel trip'));
    const sheet = await screen.findByTestId('cancel-trip-sheet');
    await user.press(within(sheet).getByRole('button', { name: 'Cancel trip' }));

    expect(await button('Restore trip')).toBeOnTheScreen();
    expect(screen.getByText('Cancelled')).toBeOnTheScreen();
    expect((await savedTrips(repository))[0]?.cancelledAt).toBe(TRIPS_NOW);

    await user.press(await button('Restore trip'));
    expect(await button('Cancel trip')).toBeOnTheScreen();
    expect((await savedTrips(repository))[0]?.cancelledAt).toBeNull();
  });

  it('explains why a cancelled trip cannot be restored', async () => {
    const { user } = await launch(
      [
        { ...lisbon, cancelledAt: 1 },
        storedTrip({ id: 'rome', title: 'Rome', startDate: '2027-07-02', endDate: '2027-07-03' }),
      ],
      '/trips/lisbon',
    );
    await user.press(await button('Restore trip'));
    expect(
      await screen.findByText('This trip can\'t be restored: its dates overlap "Rome" (Jul 2 – Jul 3, 2027).'),
    ).toBeOnTheScreen();
  });
});
