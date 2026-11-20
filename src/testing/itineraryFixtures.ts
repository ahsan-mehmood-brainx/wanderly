import { LocalActivityRepository } from '@/features/itinerary/data/LocalActivityRepository';
import { type Activity, type ActivityInput } from '@/features/itinerary/domain/Activity';
import { formatLocalTime, toMinutes } from '@/features/itinerary/domain/localTime';
import { type StoredTrip } from '@/features/trips/domain/Trip';

import { createTripStorage, storedTrip, TRIP_OWNER, TRIPS_NOW } from './tripFixtures';

/** The default trip runs 1–5 July 2027 (see `storedTrip`). */
export const ITINERARY_TRIP = storedTrip({ id: 'trip-1' });

/** 90 minutes after `start`, so an activity built with only a start time still has a valid range. */
function defaultEndTime(start: string | null | undefined): string | null {
  if (!start) return null;
  const end = toMinutes(start) + 90;
  return end < 24 * 60 ? formatLocalTime({ hour: Math.floor(end / 60), minute: end % 60 }) : null;
}

export function activity(overrides: Partial<Activity> = {}): Activity {
  const derived =
    'startTime' in overrides && !('endTime' in overrides) ? { endTime: defaultEndTime(overrides.startTime) } : {};
  return {
    id: 'act-1',
    tripId: 'trip-1',
    title: 'Belém Tower',
    description: '',
    category: 'sightseeing',
    date: '2027-07-01',
    startTime: '09:00',
    endTime: '10:30',
    latitude: null,
    longitude: null,
    address: '',
    estimatedCost: null,
    currency: 'USD',
    notes: '',
    sortOrder: 0,
    isCompleted: false,
    createdAt: TRIPS_NOW,
    updatedAt: TRIPS_NOW,
    ...derived,
    ...overrides,
  };
}

export function activityInput(overrides: Partial<ActivityInput> = {}): ActivityInput {
  return {
    title: 'Belém Tower',
    description: '',
    category: 'sightseeing',
    date: '2027-07-01',
    startTime: '09:00',
    endTime: '10:30',
    latitude: null,
    longitude: null,
    address: '',
    estimatedCost: '',
    currency: 'USD',
    notes: '',
    ...overrides,
  };
}

/** Real in-memory SQLite with both the trip and activity repositories on it. */
export function createItineraryStorage() {
  const storage = createTripStorage();
  return {
    ...storage,
    tripRepository: storage.repository,
    activityRepository: new LocalActivityRepository(storage.database, storage.logger),
  };
}

/** Storage holding `trips` and then `activities` (inserted in order), all belonging to `ownerId`. */
export async function seededItineraryDatabase(
  trips: readonly StoredTrip[] = [ITINERARY_TRIP],
  activities: readonly Activity[] = [],
  ownerId = TRIP_OWNER,
) {
  const storage = createItineraryStorage();
  for (const trip of trips) {
    const saved = await storage.tripRepository.insert(ownerId, trip);
    if (!saved.ok) throw saved.error;
  }
  for (const item of activities) {
    const saved = await storage.activityRepository.insert(ownerId, item);
    if (!saved.ok) throw saved.error;
  }
  return storage;
}
