import { addDays, daysBetween, type LocalDate } from '@/features/trips/domain/localDate';
import { type StoredTrip } from '@/features/trips/domain/Trip';

import { type Activity } from './Activity';
import { type LocalTime } from './localTime';

export type TripRange = Pick<StoredTrip, 'startDate' | 'endDate'>;

export interface ItineraryDay {
  readonly date: LocalDate;
  /** 1 for the trip's first day. */
  readonly dayNumber: number;
  /** In `sortOrder`. */
  readonly activities: readonly Activity[];
}

export interface ItineraryGroups {
  /** Every trip day, first to last, including empty ones. */
  readonly days: readonly ItineraryDay[];
  /** Activities on dates outside the trip (after its dates were edited), by date then `sortOrder`. */
  readonly outsideTrip: readonly Activity[];
}

export interface ItineraryProgress {
  readonly completed: number;
  readonly total: number;
  /** 0–1; 0 when there are no activities. */
  readonly ratio: number;
}

export interface CostTotal {
  readonly currency: string;
  /** Minor units. */
  readonly minor: number;
}

export interface TimeSpan {
  readonly start: LocalTime;
  readonly end: LocalTime;
}

/** Every date from the trip's start to its end, inclusive. */
export function tripDays(trip: TripRange): readonly LocalDate[] {
  const count = daysBetween(trip.startDate, trip.endDate) + 1;
  return Array.from({ length: Math.max(count, 0) }, (_, index) => addDays(trip.startDate, index));
}

export function isTripDay(date: LocalDate, trip: TripRange): boolean {
  return date >= trip.startDate && date <= trip.endDate;
}

/** The trip day `date` is (1 for the first day), or `null` for a date outside the trip. */
export function dayNumberOf(trip: TripRange, date: LocalDate): number | null {
  return isTripDay(date, trip) ? daysBetween(trip.startDate, date) + 1 : null;
}

const byDateThenOrder = (a: Activity, b: Activity) =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : a.sortOrder - b.sortOrder;

export function groupByDay(activities: readonly Activity[], trip: TripRange): ItineraryGroups {
  const byDate = new Map<LocalDate, Activity[]>();
  const outsideTrip: Activity[] = [];
  for (const item of activities) {
    if (!isTripDay(item.date, trip)) {
      outsideTrip.push(item);
      continue;
    }
    const list = byDate.get(item.date);
    if (list) list.push(item);
    else byDate.set(item.date, [item]);
  }

  const days = tripDays(trip).map((date, index) => ({
    date,
    dayNumber: index + 1,
    activities: (byDate.get(date) ?? []).sort((a, b) => a.sortOrder - b.sortOrder),
  }));
  return { days, outsideTrip: outsideTrip.sort(byDateThenOrder) };
}

/**
 * Where an activity starting at `startTime` goes in a day (activities in
 * `sortOrder`): after the last one that starts at or before it, ignoring untimed
 * ones; first when none does. Untimed activities go to the end.
 */
export function insertionIndex(
  dayActivities: readonly Pick<Activity, 'startTime'>[],
  startTime: LocalTime | null,
): number {
  if (startTime === null) return dayActivities.length;
  let index = 0;
  dayActivities.forEach((item, position) => {
    if (item.startTime !== null && item.startTime <= startTime) index = position + 1;
  });
  return index;
}

export function progress(activities: readonly Pick<Activity, 'isCompleted'>[]): ItineraryProgress {
  const total = activities.length;
  const completed = activities.filter((item) => item.isCompleted).length;
  return { completed, total, ratio: total === 0 ? 0 : completed / total };
}

/** Sum of estimated costs per currency (no conversion), by currency code. Activities without a cost are skipped. */
export function costTotals(activities: readonly Pick<Activity, 'estimatedCost' | 'currency'>[]): readonly CostTotal[] {
  const totals = new Map<string, number>();
  for (const { estimatedCost, currency } of activities) {
    if (estimatedCost === null) continue;
    totals.set(currency, (totals.get(currency) ?? 0) + estimatedCost);
  }
  return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, minor]) => ({ currency, minor }));
}

/** Earliest start to latest end (or start, for an activity without an end), or `null` when nothing is timed. */
export function dayTimeSpan(activities: readonly Pick<Activity, 'startTime' | 'endTime'>[]): TimeSpan | null {
  let start: LocalTime | null = null;
  let end: LocalTime | null = null;
  for (const item of activities) {
    if (item.startTime === null) continue;
    const last = item.endTime ?? item.startTime;
    if (start === null || item.startTime < start) start = item.startTime;
    if (end === null || last > end) end = last;
  }
  return start === null || end === null ? null : { start, end };
}
