import { Stack } from 'expo-router';
import { renderRouter, screen, within } from 'expo-router/testing-library';

import ItineraryRoute from '@/app/(app)/(tabs)/trips/[tripId]/itinerary/index';
import { AppProviders } from '@/bootstrap/AppProviders';
import { createI18n } from '@/core/i18n/createI18n';
import { type Activity } from '@/features/itinerary/domain/Activity';
import { createTestStore } from '@/testing/createTestStore';
import { FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { activity, seededItineraryDatabase } from '@/testing/itineraryFixtures';
import { ManualClock } from '@/testing/ManualClock';
import { createTestDependencies } from '@/testing/testDependencies';
import { storedTrip, TRIPS_NOW } from '@/testing/tripFixtures';

const lisbon = storedTrip({ id: 'lisbon', title: 'Lisbon getaway', startDate: '2027-07-01', endDate: '2027-07-02' });
const DAY_1 = '2027-07-01';

const untimed = (index: number) =>
  activity({
    id: `act-${index}`,
    tripId: 'lisbon',
    title: `Stop ${index}`,
    date: DAY_1,
    startTime: null,
    endTime: null,
    sortOrder: index,
  });

async function launch(activities: readonly Activity[]) {
  const storage = await seededItineraryDatabase([lisbon], activities);
  const dependencies = createTestDependencies({
    database: storage.database,
    clock: new ManualClock(TRIPS_NOW),
    httpClientFactory: new FakeHttpClientFactory(),
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
    },
    { initialUrl: '/trips/lisbon/itinerary' },
  );
}

describe('ItineraryOverviewScreen', () => {
  it('lists the first activities of a busy day and counts the rest', async () => {
    await launch([0, 1, 2, 3, 4].map(untimed));

    const day1 = await screen.findByTestId(`itinerary-day-${DAY_1}`);
    expect(within(day1).getByText(/5 activities/)).toBeOnTheScreen();
    expect(within(day1).getByText('Stop 0')).toBeOnTheScreen();
    expect(within(day1).getByText('Stop 2')).toBeOnTheScreen();
    expect(within(day1).queryByText('Stop 3')).toBeNull();
    expect(within(day1).getByText('+2 more')).toBeOnTheScreen();
  });

  it('lists every activity of a light day without a remainder', async () => {
    await launch([0, 1, 2].map(untimed));

    const day1 = await screen.findByTestId(`itinerary-day-${DAY_1}`);
    expect(within(day1).getByText('Stop 2')).toBeOnTheScreen();
    expect(within(day1).queryByText(/more$/)).toBeNull();
  });
});
