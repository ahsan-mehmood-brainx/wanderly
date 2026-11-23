import { activity } from '@/testing/itineraryFixtures';
import { fakeNotificationCopy, notificationSettings } from '@/testing/notificationFixtures';
import { storedTrip, TRIP_OWNER } from '@/testing/tripFixtures';

import { planReminders } from '../domain/reminderPlanning';
import { SystemDeviceTimeZone } from './SystemDeviceTimeZone';

describe('SystemDeviceTimeZone', () => {
  const zone = new SystemDeviceTimeZone();

  it('AC8 reads back the same calendar day and wall-clock time it was given, in whatever zone the device is in', () => {
    for (const date of ['2027-01-01', '2027-03-14', '2027-03-28', '2027-10-31', '2027-11-07', '2028-02-29']) {
      const epoch = zone.toEpochMs(date, '09:00');
      const back = new Date(epoch);

      expect(zone.localDateAt(epoch)).toBe(date);
      expect([back.getHours(), back.getMinutes()]).toEqual([9, 0]);
    }
  });

  it.each([
    ['2027-02-30', '09:00'],
    ['not-a-date', '09:00'],
    ['2027-06-16', '25:00'],
    ['2027-06-16', ''],
  ])('gives NaN for an impossible date or time (%s %s), never a wrong instant', (date, time) => {
    expect(zone.toEpochMs(date, time)).toBeNaN();
  });

  it('AC1 the planner skips an activity whose stored time cannot be read, keeping the rest', () => {
    const trip = storedTrip({ id: 'trip-1', startDate: '2027-06-15', endDate: '2027-06-20' });
    const broken = activity({ id: 'broken', tripId: 'trip-1', date: '2027-06-16', startTime: '99:99', endTime: null });
    const fine = activity({ id: 'fine', tripId: 'trip-1', date: '2027-06-16', startTime: '14:30' });

    const planned = planReminders({
      ownerId: TRIP_OWNER,
      trips: [trip],
      activitiesByTrip: { 'trip-1': [broken, fine] },
      settings: notificationSettings(),
      masters: { tripReminders: true, budgetAlerts: false },
      now: Date.UTC(2027, 5, 1, 12),
      timeZone: zone,
      copy: fakeNotificationCopy,
    });

    expect(planned.map(({ identifier }) => identifier)).toEqual([
      'wanderly.trip-upcoming.trip-1',
      'wanderly.trip-start.trip-1',
      'wanderly.activity.fine',
    ]);
  });
});
