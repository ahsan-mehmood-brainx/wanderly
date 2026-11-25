import { type Activity } from '@/features/itinerary/domain/Activity';
import { type NotificationPreferences } from '@/features/preferences/domain/Preferences';
import { addDays } from '@/features/trips/domain/localDate';
import { deriveTripStatus } from '@/features/trips/domain/tripStatus';
import { type StoredTrip } from '@/features/trips/domain/Trip';

import { NOTIFICATION_ID_PREFIX, notificationLinks, type PlannedNotification } from './Notification';
import { type NotificationSettings } from './NotificationSettings';
import { type DeviceTimeZone, type NotificationCopy, type NotificationTextRequest } from './repositories';

/** Day-based reminders (upcoming trip, trip start) fire at this hour on the device's wall clock. */
export const REMINDER_HOUR = 9;

/** iOS keeps at most 64 pending notifications; the soonest ones are scheduled, the rest on later runs. */
export const MAX_SCHEDULED = 60;

const REMINDER_TIME = `${String(REMINDER_HOUR).padStart(2, '0')}:00`;
const MS_PER_MINUTE = 60_000;

export interface ReminderPlanInput {
  readonly ownerId: string;
  readonly trips: readonly StoredTrip[];
  /** Trip id → its activities. */
  readonly activitiesByTrip: Readonly<Record<string, readonly Activity[]>>;
  readonly settings: NotificationSettings;
  readonly masters: NotificationPreferences;
  /** Epoch ms. */
  readonly now: number;
  readonly timeZone: DeviceTimeZone;
  readonly copy: NotificationCopy;
}

export const reminderIdentifiers = {
  tripUpcoming: (tripId: string) => `${NOTIFICATION_ID_PREFIX}trip-upcoming.${tripId}`,
  tripStart: (tripId: string) => `${NOTIFICATION_ID_PREFIX}trip-start.${tripId}`,
  activity: (activityId: string) => `${NOTIFICATION_ID_PREFIX}activity.${activityId}`,
} as const;

/** Trips that can still have reminders: not cancelled and not over on the device's calendar today. */
export function isActiveTrip(trip: StoredTrip, today: string): boolean {
  const status = deriveTripStatus(trip, today);
  return status === 'upcoming' || status === 'ongoing';
}

/** Every reminder that should be scheduled right now, soonest first. */
export function planReminders(input: ReminderPlanInput): PlannedNotification[] {
  const { ownerId, trips, activitiesByTrip, settings, masters, now, timeZone, copy } = input;
  if (!masters.tripReminders) return [];

  const today = timeZone.localDateAt(now);
  const planned: PlannedNotification[] = [];
  const add = (
    identifier: string,
    kind: PlannedNotification['kind'],
    fireAt: number,
    url: string,
    request: NotificationTextRequest,
  ) => {
    if (!Number.isFinite(fireAt) || fireAt <= now) return;
    const { title, body } = copy(request);
    planned.push({
      identifier,
      kind,
      ownerId,
      fireAt,
      title,
      body,
      url,
      fingerprint: [fireAt, title, body, url].join('|'),
    });
  };

  for (const trip of trips) {
    if (!isActiveTrip(trip, today)) continue;
    const tripUrl = notificationLinks.trip(trip.id);

    if (settings.upcomingTripDaysBefore !== null) {
      const daysBefore = settings.upcomingTripDaysBefore;
      add(
        reminderIdentifiers.tripUpcoming(trip.id),
        'tripUpcoming',
        timeZone.toEpochMs(addDays(trip.startDate, -daysBefore), REMINDER_TIME),
        tripUrl,
        { kind: 'tripUpcoming', tripTitle: trip.title, destination: trip.destinationName, daysBefore },
      );
    }

    if (settings.tripStartReminder) {
      add(
        reminderIdentifiers.tripStart(trip.id),
        'tripStart',
        timeZone.toEpochMs(trip.startDate, REMINDER_TIME),
        tripUrl,
        { kind: 'tripStart', tripTitle: trip.title, destination: trip.destinationName },
      );
    }

    if (settings.activityMinutesBefore !== null) {
      const minutesBefore = settings.activityMinutesBefore;
      for (const activity of activitiesByTrip[trip.id] ?? []) {
        const { startTime } = activity;
        if (startTime === null || activity.isCompleted || activity.tripId !== trip.id) continue;
        if (activity.date < trip.startDate || activity.date > trip.endDate) continue;
        add(
          reminderIdentifiers.activity(activity.id),
          'activity',
          timeZone.toEpochMs(activity.date, startTime) - minutesBefore * MS_PER_MINUTE,
          notificationLinks.activity(trip.id, activity.id),
          { kind: 'activity', activityTitle: activity.title, tripTitle: trip.title, startTime, minutesBefore },
        );
      }
    }
  }

  return planned
    .sort((a, b) => a.fireAt - b.fireAt || a.identifier.localeCompare(b.identifier))
    .slice(0, MAX_SCHEDULED);
}
