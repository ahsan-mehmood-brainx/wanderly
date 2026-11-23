import { type LocalDate } from '@/features/trips/domain/localDate';
import { type StoredTrip } from '@/features/trips/domain/Trip';
import { deriveTripStatus } from '@/features/trips/domain/tripStatus';

export interface TravelStats {
  /** Every trip except cancelled ones. */
  readonly totalTrips: number;
  /** Trips that ended before today (and weren't cancelled). */
  readonly completedTrips: number;
  /** Every saved favorite. */
  readonly savedPlaces: number;
}

export function summarizeTravelStats(
  trips: readonly Pick<StoredTrip, 'startDate' | 'endDate' | 'cancelledAt'>[],
  favoritesCount: number,
  today: LocalDate,
): TravelStats {
  let totalTrips = 0;
  let completedTrips = 0;
  for (const trip of trips) {
    const status = deriveTripStatus(trip, today);
    if (status === 'cancelled') continue;
    totalTrips += 1;
    if (status === 'completed') completedTrips += 1;
  }
  return { totalTrips, completedTrips, savedPlaces: favoritesCount };
}
