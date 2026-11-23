import { routes } from '@/shared/navigation/routes';
import { OTHER_TRIP_OWNER, TRIP_OWNER } from '@/testing/tripFixtures';

import { routeForNotification } from './notificationRouting';

const data = (url: unknown, ownerId: unknown = TRIP_OWNER, kind: unknown = 'tripStart') => ({
  url,
  ownerId,
  kind,
  fingerprint: 'f',
});

describe('routeForNotification', () => {
  it('AC7 opens the trip for trip reminders', () => {
    expect(routeForNotification(data('wanderly://trips/trip-1', TRIP_OWNER, 'tripUpcoming'), TRIP_OWNER)).toEqual(
      routes.trip('trip-1'),
    );
    expect(routeForNotification(data('/trips/trip-1', TRIP_OWNER, 'tripStart'), TRIP_OWNER)).toEqual(
      routes.trip('trip-1'),
    );
  });

  it('AC7 opens the activity for activity reminders', () => {
    expect(
      routeForNotification(data('wanderly://trips/trip-1/itinerary/act-1', TRIP_OWNER, 'activity'), TRIP_OWNER),
    ).toEqual(routes.itineraryItem('trip-1', 'act-1'));
  });

  it("AC7 opens the trip's budget for budget alerts", () => {
    expect(routeForNotification(data('wanderly://budget/trip-1', TRIP_OWNER, 'budget'), TRIP_OWNER)).toEqual(
      routes.tripBudget('trip-1'),
    );
  });

  it.each<[string, unknown]>([
    ['nothing', undefined],
    ['null', null],
    ['a string', 'wanderly://trips/trip-1'],
    ['an array', ['wanderly://trips/trip-1']],
    ['no url', { ownerId: TRIP_OWNER, kind: 'tripStart' }],
    ['a url that is not text', data(42)],
    ['no owner', { url: 'wanderly://trips/trip-1', kind: 'tripStart' }],
    ['an owner that is not text', data('wanderly://trips/trip-1', 1)],
  ])('AC7 ignores malformed data: %s', (_name, payload) => {
    expect(routeForNotification(payload, TRIP_OWNER)).toBeNull();
  });

  it.each([
    'wanderly://sign-in',
    'wanderly://register',
    'wanderly://onboarding',
    'https://evil.example.com/steal',
    'wanderly://trips/..%2F..%2Fsign-in',
    'wanderly://trips/trip 1',
    '',
  ])('AC7 ignores a link outside the allow-list: %s', (url) => {
    expect(routeForNotification(data(url), TRIP_OWNER)).toBeNull();
  });

  it("AC7 ignores another account's notification", () => {
    expect(routeForNotification(data('wanderly://trips/trip-1', OTHER_TRIP_OWNER), TRIP_OWNER)).toBeNull();
  });

  it('AC7 ignores a notification while nobody is signed in', () => {
    expect(routeForNotification(data('wanderly://trips/trip-1'), null)).toBeNull();
  });
});
