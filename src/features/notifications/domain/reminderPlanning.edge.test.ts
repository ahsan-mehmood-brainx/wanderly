import { type Activity } from '@/features/itinerary/domain/Activity';
import { activity } from '@/testing/itineraryFixtures';
import {
  fakeNotificationCopy,
  FixedOffsetTimeZone,
  notificationSettings,
  wallClock,
} from '@/testing/notificationFixtures';
import { storedTrip, TRIP_OWNER } from '@/testing/tripFixtures';

import { type NotificationSettings } from './NotificationSettings';
import { planReminders, type ReminderPlanInput } from './reminderPlanning';

/** 1 June 2027, 12:00 UTC. */
const NOW = Date.UTC(2027, 5, 1, 12);

const TRIP = storedTrip({ id: 'trip-1', title: 'Lisbon getaway', startDate: '2027-06-15', endDate: '2027-06-20' });

function plan(
  overrides: Partial<Omit<ReminderPlanInput, 'settings'>> & { readonly settings?: Partial<NotificationSettings> } = {},
) {
  const { settings, ...rest } = overrides;
  return planReminders({
    ownerId: TRIP_OWNER,
    trips: [TRIP],
    activitiesByTrip: {},
    masters: { tripReminders: true, budgetAlerts: false },
    now: NOW,
    timeZone: new FixedOffsetTimeZone(0),
    copy: fakeNotificationCopy,
    ...rest,
    settings: notificationSettings(settings),
  });
}

const fireTimes = (planned: ReturnType<typeof plan>) =>
  Object.fromEntries(planned.map(({ identifier, fireAt }) => [identifier, fireAt]));

describe('planReminders calendar boundaries', () => {
  it('AC1 an upcoming-trip reminder for a 1 January trip fires on 31 December of the year before', () => {
    const trip = storedTrip({ id: 'ny', startDate: '2028-01-01', endDate: '2028-01-03' });

    expect(fireTimes(plan({ trips: [trip] }))['wanderly.trip-upcoming.ny']).toBe(wallClock('2027-12-31', '09:00'));
  });

  it('AC1 one day before 1 March in a leap year is 29 February', () => {
    const trip = storedTrip({ id: 'leap', startDate: '2028-03-01', endDate: '2028-03-02' });

    expect(fireTimes(plan({ trips: [trip] }))['wanderly.trip-upcoming.leap']).toBe(wallClock('2028-02-29', '09:00'));
  });

  it('AC6 seven days before crosses into the previous month', () => {
    const trip = storedTrip({ id: 'jul', startDate: '2027-07-03', endDate: '2027-07-05' });

    const planned = plan({ trips: [trip], settings: { upcomingTripDaysBefore: 7 } });

    expect(fireTimes(planned)['wanderly.trip-upcoming.jul']).toBe(wallClock('2027-06-26', '09:00'));
  });

  it('AC1 an activity just after midnight, 2 hours before, fires the evening before', () => {
    const early = activity({ id: 'early', tripId: TRIP.id, date: '2027-06-15', startTime: '00:30' });

    const planned = plan({ activitiesByTrip: { [TRIP.id]: [early] } });

    expect(fireTimes(planned)['wanderly.activity.early']).toBe(wallClock('2027-06-14', '22:30'));
  });

  it('AC1 plans an activity on the single day of a one-day trip', () => {
    const dayTrip = storedTrip({ id: 'day', startDate: '2027-06-15', endDate: '2027-06-15' });
    const item = activity({ id: 'museum', tripId: 'day', date: '2027-06-15', startTime: '15:00' });

    const planned = plan({ trips: [dayTrip], activitiesByTrip: { day: [item] } });

    expect(fireTimes(planned)['wanderly.activity.museum']).toBe(wallClock('2027-06-15', '13:00'));
  });
});

describe('planReminders around now', () => {
  it('AC1 drops a reminder due exactly now and keeps one due a millisecond later', () => {
    const startReminder = wallClock('2027-06-15', '09:00');

    expect(fireTimes(plan({ now: startReminder }))['wanderly.trip-start.trip-1']).toBeUndefined();
    expect(fireTimes(plan({ now: startReminder - 1 }))['wanderly.trip-start.trip-1']).toBe(startReminder);
  });

  it('AC1 the day before a trip, after 09:00, only the trip start reminder is left', () => {
    const planned = plan({ now: wallClock('2027-06-14', '10:00') });

    expect(planned.map(({ identifier }) => identifier)).toEqual(['wanderly.trip-start.trip-1']);
  });

  it("AC8 decides whether a trip is over on the device's calendar, not UTC's", () => {
    const lastEvening = activity({ id: 'dinner', tripId: TRIP.id, date: '2027-06-20', startTime: '22:00' });
    // 21 June 02:00 UTC is still 20 June 21:00 in UTC-05:00, the trip's last day.
    const now = Date.UTC(2027, 5, 21, 2);
    const input = {
      now,
      activitiesByTrip: { [TRIP.id]: [lastEvening] },
      settings: { activityMinutesBefore: 15 } as const,
    };

    const newYork = plan({ ...input, timeZone: new FixedOffsetTimeZone(-300) });
    const utc = plan({ ...input, timeZone: new FixedOffsetTimeZone(0) });

    expect(fireTimes(newYork)).toEqual({ 'wanderly.activity.dinner': wallClock('2027-06-20', '21:45', -300) });
    expect(utc).toEqual([]);
  });
});

describe('planReminders missing or mismatched data', () => {
  it('AC1 plans nothing for no trips', () => {
    expect(plan({ trips: [] })).toEqual([]);
  });

  it('AC1 plans the trip reminders of a trip with no activity list', () => {
    expect(plan({ activitiesByTrip: {} }).map(({ identifier }) => identifier)).toEqual([
      'wanderly.trip-upcoming.trip-1',
      'wanderly.trip-start.trip-1',
    ]);
  });

  it("AC1 ignores an activity listed under a trip it doesn't belong to", () => {
    const stray: Activity = activity({ id: 'stray', tripId: 'trip-other', date: '2027-06-16', startTime: '10:00' });

    expect(fireTimes(plan({ activitiesByTrip: { [TRIP.id]: [stray] } }))['wanderly.activity.stray']).toBeUndefined();
  });

  it('AC2 orders reminders due at the same moment by identifier, so every run plans the same list', () => {
    const a = storedTrip({ id: 'b-trip', startDate: '2027-06-15', endDate: '2027-06-16' });
    const b = storedTrip({ id: 'a-trip', startDate: '2027-06-15', endDate: '2027-06-16' });

    const forward = plan({ trips: [a, b], settings: { upcomingTripDaysBefore: null } });
    const backward = plan({ trips: [b, a], settings: { upcomingTripDaysBefore: null } });

    expect(forward.map(({ identifier }) => identifier)).toEqual([
      'wanderly.trip-start.a-trip',
      'wanderly.trip-start.b-trip',
    ]);
    expect(backward).toEqual(forward);
  });

  it('AC1 keeps a very long trip title whole in the text and fingerprint', () => {
    const title = 'Grand tour '.repeat(500).trim();
    const longTitle = storedTrip({ ...TRIP, title });

    const [first] = plan({ trips: [longTitle] });

    expect(first?.body).toContain(title);
    expect(first?.fingerprint).toContain(title);
  });
});
