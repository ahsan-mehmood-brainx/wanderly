import { type Activity } from '@/features/itinerary/domain/Activity';
import { type NotificationPreferences } from '@/features/preferences/domain/Preferences';
import { addDays } from '@/features/trips/domain/localDate';
import { resolveDeepLink } from '@/shared/navigation/deepLinks';
import { routes } from '@/shared/navigation/routes';
import { activity } from '@/testing/itineraryFixtures';
import {
  fakeNotificationCopy,
  FixedOffsetTimeZone,
  notificationSettings,
  wallClock,
} from '@/testing/notificationFixtures';
import { storedTrip, TRIP_OWNER } from '@/testing/tripFixtures';

import { type NotificationSettings } from './NotificationSettings';
import { MAX_SCHEDULED, planReminders, type ReminderPlanInput } from './reminderPlanning';

/** 1 June 2027, 12:00 UTC: two weeks before the trip. */
const NOW = Date.UTC(2027, 5, 1, 12);

const TRIP = storedTrip({ id: 'trip-1', title: 'Lisbon getaway', startDate: '2027-06-15', endDate: '2027-06-20' });
const ACTIVITY = activity({
  id: 'act-1',
  tripId: 'trip-1',
  title: 'Belém Tower',
  date: '2027-06-16',
  startTime: '14:30',
});

const MASTERS_ON: NotificationPreferences = { tripReminders: true, budgetAlerts: false };

function plan(
  overrides: Partial<Omit<ReminderPlanInput, 'settings'>> & { readonly settings?: Partial<NotificationSettings> } = {},
) {
  const { settings, ...rest } = overrides;
  return planReminders({
    ownerId: TRIP_OWNER,
    trips: [TRIP],
    activitiesByTrip: { [TRIP.id]: [ACTIVITY] },
    masters: MASTERS_ON,
    now: NOW,
    timeZone: new FixedOffsetTimeZone(0),
    copy: fakeNotificationCopy,
    ...rest,
    settings: notificationSettings(settings),
  });
}

const summary = (planned: ReturnType<typeof plan>) =>
  planned.map(({ identifier, kind, fireAt }) => ({ identifier, kind, fireAt }));

describe('planReminders', () => {
  it('AC1 plans the upcoming-trip, trip-start and activity reminders with the default settings', () => {
    expect(summary(plan())).toEqual([
      { identifier: 'wanderly.trip-upcoming.trip-1', kind: 'tripUpcoming', fireAt: wallClock('2027-06-14', '09:00') },
      { identifier: 'wanderly.trip-start.trip-1', kind: 'tripStart', fireAt: wallClock('2027-06-15', '09:00') },
      { identifier: 'wanderly.activity.act-1', kind: 'activity', fireAt: wallClock('2027-06-16', '12:30') },
    ]);
  });

  it('AC1 tags every reminder with the owner and a link the deep-link allow-list opens', () => {
    const [upcoming, start, reminder] = plan();

    expect([upcoming?.ownerId, start?.ownerId, reminder?.ownerId]).toEqual([TRIP_OWNER, TRIP_OWNER, TRIP_OWNER]);
    expect(resolveDeepLink(upcoming?.url ?? '')).toEqual(routes.trip('trip-1'));
    expect(resolveDeepLink(start?.url ?? '')).toEqual(routes.trip('trip-1'));
    expect(resolveDeepLink(reminder?.url ?? '')).toEqual(routes.itineraryItem('trip-1', 'act-1'));
  });

  it('AC1 writes the text from the trip and activity', () => {
    const [upcoming, start, reminder] = plan();

    expect(upcoming?.title).toBe('tripUpcoming');
    expect(upcoming?.body).toContain('tripTitle=Lisbon getaway');
    expect(upcoming?.body).toContain('daysBefore=1');
    expect(start?.body).toContain('destination=Portugal');
    expect(reminder?.body).toContain('activityTitle=Belém Tower');
    expect(reminder?.body).toContain('startTime=14:30');
    expect(reminder?.body).toContain('minutesBefore=120');
  });

  it('AC1 skips untimed and completed activities', () => {
    const planned = plan({
      activitiesByTrip: {
        [TRIP.id]: [
          activity({ id: 'untimed', tripId: 'trip-1', date: '2027-06-16', startTime: null, endTime: null }),
          activity({ id: 'done', tripId: 'trip-1', date: '2027-06-16', startTime: '10:00', isCompleted: true }),
        ],
      },
    });

    expect(planned.map(({ identifier }) => identifier)).toEqual([
      'wanderly.trip-upcoming.trip-1',
      'wanderly.trip-start.trip-1',
    ]);
  });

  it('AC1 skips activities dated outside the trip', () => {
    const planned = plan({
      activitiesByTrip: {
        [TRIP.id]: [
          activity({ id: 'before', tripId: 'trip-1', date: '2027-06-14', startTime: '10:00' }),
          activity({ id: 'after', tripId: 'trip-1', date: '2027-06-21', startTime: '10:00' }),
          activity({ id: 'last-day', tripId: 'trip-1', date: '2027-06-20', startTime: '10:00' }),
        ],
      },
    });

    expect(planned.map(({ identifier }) => identifier)).toContain('wanderly.activity.last-day');
    expect(planned.map(({ identifier }) => identifier)).not.toContain('wanderly.activity.before');
    expect(planned.map(({ identifier }) => identifier)).not.toContain('wanderly.activity.after');
  });

  it('AC1 plans nothing for a cancelled trip or its activities', () => {
    expect(plan({ trips: [{ ...TRIP, cancelledAt: NOW - 1_000 }] })).toEqual([]);
  });

  it('AC1 plans nothing for a completed trip', () => {
    const past = storedTrip({ id: 'trip-1', startDate: '2027-05-01', endDate: '2027-05-05' });
    const pastActivity = activity({ id: 'act-1', tripId: 'trip-1', date: '2027-05-02', startTime: '10:00' });

    expect(plan({ trips: [past], activitiesByTrip: { [past.id]: [pastActivity] } })).toEqual([]);
  });

  it('AC1 drops reminders whose time is at or before now, keeping later ones of an ongoing trip', () => {
    const now = wallClock('2027-06-16', '12:30');
    const planned = plan({
      now,
      activitiesByTrip: {
        [TRIP.id]: [
          ACTIVITY,
          activity({ id: 'evening', tripId: 'trip-1', date: '2027-06-16', startTime: '20:00' }),
          activity({ id: 'tomorrow', tripId: 'trip-1', date: '2027-06-17', startTime: '09:00' }),
        ],
      },
    });

    expect(summary(planned)).toEqual([
      { identifier: 'wanderly.activity.evening', kind: 'activity', fireAt: wallClock('2027-06-16', '18:00') },
      { identifier: 'wanderly.activity.tomorrow', kind: 'activity', fireAt: wallClock('2027-06-17', '07:00') },
    ]);
  });

  it('AC1 ignores activities of a trip that is no longer there (deleted)', () => {
    expect(plan({ trips: [], activitiesByTrip: { [TRIP.id]: [ACTIVITY] } })).toEqual([]);
  });

  it(`AC1 schedules at most ${MAX_SCHEDULED} reminders, the soonest ones`, () => {
    const long = storedTrip({ id: 'trip-1', startDate: '2027-06-15', endDate: '2027-08-31' });
    const activities: Activity[] = [];
    for (let day = 0; day < 40; day += 1) {
      const date = addDays('2027-06-16', day);
      activities.push(activity({ id: `am-${day}`, tripId: 'trip-1', date, startTime: '10:00' }));
      activities.push(activity({ id: `pm-${day}`, tripId: 'trip-1', date, startTime: '16:00' }));
    }

    const planned = plan({ trips: [long], activitiesByTrip: { [long.id]: activities } });

    expect(MAX_SCHEDULED).toBe(60);
    expect(planned).toHaveLength(60);
    const fireTimes = planned.map(({ fireAt }) => fireAt);
    expect(fireTimes).toEqual([...fireTimes].sort((a, b) => a - b));
    expect(planned[0]?.identifier).toBe('wanderly.trip-upcoming.trip-1');
    expect(planned.map(({ identifier }) => identifier)).toContain('wanderly.activity.am-28');
    expect(planned.map(({ identifier }) => identifier)).not.toContain('wanderly.activity.pm-39');
  });

  it('AC1 plans nothing while Trip reminders is off', () => {
    expect(plan({ masters: { tripReminders: false, budgetAlerts: true } })).toEqual([]);
  });

  it('AC6 follows the reminder times the traveller chose', () => {
    const planned = plan({ settings: { upcomingTripDaysBefore: 7, activityMinutesBefore: 15 } });

    expect(summary(planned)).toEqual([
      { identifier: 'wanderly.trip-upcoming.trip-1', kind: 'tripUpcoming', fireAt: wallClock('2027-06-08', '09:00') },
      { identifier: 'wanderly.trip-start.trip-1', kind: 'tripStart', fireAt: wallClock('2027-06-15', '09:00') },
      { identifier: 'wanderly.activity.act-1', kind: 'activity', fireAt: wallClock('2027-06-16', '14:15') },
    ]);
  });

  it('AC6 an activity reminder a day before fires at the same time on the previous day', () => {
    const [, , reminder] = plan({ settings: { activityMinutesBefore: 1440 } });

    expect(reminder?.fireAt).toBe(wallClock('2027-06-15', '14:30'));
  });

  it('AC6 leaves out each reminder type that is turned off', () => {
    expect(plan({ settings: { upcomingTripDaysBefore: null } }).map(({ kind }) => kind)).toEqual([
      'tripStart',
      'activity',
    ]);
    expect(plan({ settings: { tripStartReminder: false } }).map(({ kind }) => kind)).toEqual([
      'tripUpcoming',
      'activity',
    ]);
    expect(plan({ settings: { activityMinutesBefore: null } }).map(({ kind }) => kind)).toEqual([
      'tripUpcoming',
      'tripStart',
    ]);
  });

  it('AC2 gives the same identifiers and fingerprints for the same data', () => {
    expect(plan()).toEqual(plan());
  });

  it('AC2 changes the activity fingerprint, and only that one, when its time changes', () => {
    const before = plan();
    const after = plan({ activitiesByTrip: { [TRIP.id]: [{ ...ACTIVITY, startTime: '16:00', endTime: '17:00' }] } });

    expect(after.map(({ identifier }) => identifier)).toEqual(before.map(({ identifier }) => identifier));
    expect(after[0]?.fingerprint).toBe(before[0]?.fingerprint);
    expect(after[1]?.fingerprint).toBe(before[1]?.fingerprint);
    expect(after[2]?.fingerprint).not.toBe(before[2]?.fingerprint);
  });

  it('AC2 changes the fingerprint when the text changes (another language)', () => {
    const before = plan();
    const after = plan({ copy: (request) => ({ ...fakeNotificationCopy(request), title: `es:${request.kind}` }) });

    expect(after[0]?.fingerprint).not.toBe(before[0]?.fingerprint);
  });

  it('AC1 marks every reminder with the owner it was planned for', () => {
    const planned = plan({ ownerId: '2' });

    expect(planned.every(({ ownerId }) => ownerId === '2')).toBe(true);
  });
});

describe('planReminders across time zones', () => {
  it.each([
    ['UTC+05:00', 300],
    ['UTC-04:00', -240],
  ])('AC8 fires at the same wall-clock time in %s', (_zone, offset) => {
    const planned = plan({ timeZone: new FixedOffsetTimeZone(offset) });

    expect(summary(planned)).toEqual([
      {
        identifier: 'wanderly.trip-upcoming.trip-1',
        kind: 'tripUpcoming',
        fireAt: wallClock('2027-06-14', '09:00', offset),
      },
      { identifier: 'wanderly.trip-start.trip-1', kind: 'tripStart', fireAt: wallClock('2027-06-15', '09:00', offset) },
      { identifier: 'wanderly.activity.act-1', kind: 'activity', fireAt: wallClock('2027-06-16', '12:30', offset) },
    ]);
  });

  it('AC8 a zone change gives new fire times and fingerprints for the same reminders', () => {
    const lisbon = plan({ timeZone: new FixedOffsetTimeZone(60) });
    const karachi = plan({ timeZone: new FixedOffsetTimeZone(300) });

    expect(karachi.map(({ identifier }) => identifier)).toEqual(lisbon.map(({ identifier }) => identifier));
    expect(karachi[1]?.fireAt).toBe((lisbon[1]?.fireAt ?? 0) - 4 * 60 * 60_000);
    expect(karachi.map(({ fingerprint }) => fingerprint)).not.toEqual(lisbon.map(({ fingerprint }) => fingerprint));
  });
});
