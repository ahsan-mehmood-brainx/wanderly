import { daysBetween, isLocalDate, type LocalDate } from './localDate';
import { type AmountParseError, isCurrencyCode, parseAmount } from './money';
import { type StoredTrip, TRIP_LIMITS, type TripDraft, type TripInput } from './Trip';

export type TripField = 'title' | 'destination' | 'dates' | 'budget' | 'currency' | 'description';

export type TripFieldError =
  | 'required'
  | 'tooLong'
  /** Dates: the end date is before the start date. */
  | 'endBeforeStart'
  /** Dates: longer than {@link TRIP_LIMITS.maxDurationDays}. */
  | 'tooManyDays'
  /** Dates: overlaps another trip (see {@link tripsOverlap}); the conflicting trip is in `conflict`. */
  | 'overlap'
  | 'invalid'
  | Exclude<AmountParseError, 'required'>;

/** The trip a new or edited trip would overlap, with enough to name it in the message. */
export interface TripConflict {
  readonly id: string;
  readonly title: string;
  readonly startDate: LocalDate;
  readonly endDate: LocalDate;
}

export interface TripValidationErrors {
  readonly fields: Partial<Record<TripField, TripFieldError>>;
  readonly conflict?: TripConflict;
}

export type TripValidation =
  { readonly ok: true; readonly draft: TripDraft } | { readonly ok: false; readonly errors: TripValidationErrors };

/** Checks everything that doesn't need other trips (overlaps are checked against storage by the use cases). */
export function validateTripInput(input: TripInput): TripValidation {
  const fields: Partial<Record<TripField, TripFieldError>> = {};

  const title = input.title.trim();
  if (!title) fields.title = 'required';
  else if (title.length > TRIP_LIMITS.titleMaxLength) fields.title = 'tooLong';

  const destinationName = input.destination?.name.trim() ?? '';
  if (!input.destination || !input.destination.id.trim() || !destinationName) fields.destination = 'required';
  else if (destinationName.length > TRIP_LIMITS.destinationNameMaxLength) fields.destination = 'tooLong';

  const { startDate, endDate } = input;
  if (startDate === null || endDate === null) fields.dates = 'required';
  else if (!isLocalDate(startDate) || !isLocalDate(endDate)) fields.dates = 'invalid';
  else if (endDate < startDate) fields.dates = 'endBeforeStart';
  else if (daysBetween(startDate, endDate) + 1 > TRIP_LIMITS.maxDurationDays) fields.dates = 'tooManyDays';

  const description = input.description.trim();
  if (description.length > TRIP_LIMITS.descriptionMaxLength) fields.description = 'tooLong';

  let budget = 0;
  if (!isCurrencyCode(input.currency)) {
    fields.currency = 'invalid';
  } else {
    const amount = parseAmount(input.budget, input.currency, TRIP_LIMITS.maxBudgetMajor);
    if (amount.ok) budget = amount.minor;
    else fields.budget = amount.error;
  }

  if (Object.keys(fields).length > 0 || !input.destination || startDate === null || endDate === null) {
    return { ok: false, errors: { fields } };
  }
  return {
    ok: true,
    draft: {
      title,
      destination: { id: input.destination.id.trim(), name: destinationName },
      startDate,
      endDate,
      description,
      coverImage: input.coverImage,
      budget,
      currency: input.currency,
    },
  };
}

type DateRange = Pick<StoredTrip, 'startDate' | 'endDate'>;

/**
 * **Product rule: a traveller can't be on two trips at once.** Two trips that
 * aren't cancelled may not overlap. They overlap when each starts before the
 * other ends. Trips that only touch are fine: one may start on the day another
 * ends, because that's a travel day between legs (Lisbon 1–5 May, then Porto
 * 5–8 May). Two day trips on the same date also count as touching.
 *
 * Cancelled trips never conflict, so cancelling a trip frees its dates, and
 * restoring one is refused if its dates were taken meanwhile.
 */
export function tripsOverlap(a: DateRange, b: DateRange): boolean {
  return a.startDate < b.endDate && b.startDate < a.endDate;
}

/** The first active trip (by start date) that `range` would overlap, ignoring `excludeId` (the trip being edited). */
export function findOverlappingTrip<T extends StoredTrip>(
  range: DateRange,
  trips: readonly T[],
  excludeId: string | null,
): T | null {
  return (
    [...trips]
      .filter((trip) => trip.id !== excludeId && trip.cancelledAt === null && tripsOverlap(range, trip))
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null
  );
}

export function toConflict(trip: StoredTrip): TripConflict {
  return { id: trip.id, title: trip.title, startDate: trip.startDate, endDate: trip.endDate };
}
