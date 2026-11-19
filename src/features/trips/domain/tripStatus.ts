import { daysBetween, type LocalDate } from './localDate';
import { type StoredTrip, type Trip, type TripStatus } from './Trip';

type Dated = Pick<StoredTrip, 'startDate' | 'endDate' | 'cancelledAt'>;

/**
 * The trip's status on `today` (the traveller's local date). Both the start and
 * end days count as part of the trip, so a trip is `ongoing` on its last day and
 * `completed` from the day after.
 */
export function deriveTripStatus(trip: Dated, today: LocalDate): TripStatus {
  if (trip.cancelledAt !== null) return 'cancelled';
  if (today < trip.startDate) return 'upcoming';
  if (today > trip.endDate) return 'completed';
  return 'ongoing';
}

/** Returns the same object when the status hasn't changed, so memoised selectors stay stable. */
export function withStatus<T extends StoredTrip>(trip: T, today: LocalDate): T & Trip {
  const status = deriveTripStatus(trip, today);
  if ('status' in trip && (trip as T & Trip).status === status) return trip as T & Trip;
  return { ...trip, status };
}

/** Days in the trip, counting the first and last: a weekend away from Saturday to Sunday is 2. */
export function tripLengthDays(trip: Pick<StoredTrip, 'startDate' | 'endDate'>): number {
  return daysBetween(trip.startDate, trip.endDate) + 1;
}

/** Where today falls relative to the trip, for "Starts in 3 days" / "Day 2 of 5" / "Ended 4 days ago". */
export type TripTimeline =
  | { readonly kind: 'startsIn'; readonly days: number }
  | { readonly kind: 'inProgress'; readonly day: number; readonly of: number }
  | { readonly kind: 'endedAgo'; readonly days: number }
  | { readonly kind: 'cancelled' };

export function tripTimeline(trip: Dated, today: LocalDate): TripTimeline {
  switch (deriveTripStatus(trip, today)) {
    case 'cancelled':
      return { kind: 'cancelled' };
    case 'upcoming':
      return { kind: 'startsIn', days: daysBetween(today, trip.startDate) };
    case 'completed':
      return { kind: 'endedAgo', days: daysBetween(trip.endDate, today) };
    case 'ongoing':
      return { kind: 'inProgress', day: daysBetween(trip.startDate, today) + 1, of: tripLengthDays(trip) };
  }
}

/**
 * Display order inside each status group: what's happening soonest first for
 * ongoing and upcoming trips, most recent first for completed and cancelled ones.
 */
export function compareTripsForStatus(status: TripStatus): (a: StoredTrip, b: StoredTrip) => number {
  const byStartThenTitle = (a: StoredTrip, b: StoredTrip) =>
    a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
  switch (status) {
    case 'ongoing':
      return (a, b) => a.endDate.localeCompare(b.endDate) || byStartThenTitle(a, b);
    case 'upcoming':
      return byStartThenTitle;
    case 'completed':
      return (a, b) => b.endDate.localeCompare(a.endDate) || byStartThenTitle(a, b);
    case 'cancelled':
      return (a, b) => b.startDate.localeCompare(a.startDate) || byStartThenTitle(a, b);
  }
}
