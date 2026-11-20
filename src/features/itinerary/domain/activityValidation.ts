import { checkCoordinates } from '@/features/map/domain/geo';
import { isLocalDate, type LocalDate } from '@/features/trips/domain/localDate';
import { type AmountParseError, isCurrencyCode, parseAmount } from '@/features/trips/domain/money';

import {
  type Activity,
  ACTIVITY_CATEGORIES,
  ACTIVITY_LIMITS,
  type ActivityDraft,
  type ActivityInput,
} from './Activity';
import { isTripDay, type TripRange } from './itinerary';
import { isLocalTime, type LocalTime } from './localTime';

export type ActivityField =
  | 'title'
  | 'description'
  | 'category'
  | 'date'
  | 'startTime'
  | 'endTime'
  | 'location'
  | 'address'
  | 'cost'
  | 'currency'
  | 'notes';

export type ActivityFieldError =
  | 'required'
  | 'tooLong'
  | 'invalid'
  /** Date: not one of the trip's days. */
  | 'outsideTrip'
  /** Date: the day already holds the maximum number of activities. */
  | 'dayFull'
  /** End time: set without a start time. */
  | 'endWithoutStart'
  /** End time: not later than the start time. */
  | 'invalidRange'
  /** Location: only one coordinate, or one out of range. */
  | 'invalidLocation'
  /** Title: the same activity is already planned; it is in `duplicate`. */
  | 'duplicate'
  | Exclude<AmountParseError, 'required'>;

/** The existing activity a new or edited one duplicates, with enough to name it. */
export interface ActivityDuplicate {
  readonly id: string;
  readonly title: string;
  readonly date: LocalDate;
  readonly startTime: LocalTime | null;
}

export interface ActivityValidationErrors {
  readonly fields: Partial<Record<ActivityField, ActivityFieldError>>;
  readonly duplicate?: ActivityDuplicate;
}

export type ActivityValidation =
  | { readonly ok: true; readonly draft: ActivityDraft }
  | { readonly ok: false; readonly errors: ActivityValidationErrors };

export interface ActivityValidationContext {
  readonly trip: TripRange;
  /** Activities already on the input's date (of the same trip). */
  readonly sameDay: readonly Activity[];
  /** The activity being edited, ignored in `sameDay`. */
  readonly excludeId?: string | null;
}

/** How two titles are compared for duplicates: trimmed and case-insensitive. */
export function normalizeTitle(title: string): string {
  return title.trim().toLocaleLowerCase();
}

/**
 * **Product rule: the same activity can't be planned twice.** An activity is a
 * duplicate of another on the same day of the trip when their titles match
 * (trimmed, any case) and they start at the same time (two untimed ones count as
 * the same time). Overlapping times are allowed and only warned about.
 */
export function findDuplicate(
  candidate: Pick<Activity, 'title' | 'date' | 'startTime'>,
  sameDay: readonly Activity[],
  excludeId: string | null,
): Activity | null {
  const title = normalizeTitle(candidate.title);
  return (
    sameDay.find(
      (item) =>
        item.id !== excludeId &&
        item.date === candidate.date &&
        item.startTime === candidate.startTime &&
        normalizeTitle(item.title) === title,
    ) ?? null
  );
}

const isCategory = (value: unknown): value is ActivityDraft['category'] =>
  typeof value === 'string' && (ACTIVITY_CATEGORIES as readonly string[]).includes(value);

/** Checks every rule, including those that need the trip and the activities already on the day. */
export function validateActivityInput(input: ActivityInput, context: ActivityValidationContext): ActivityValidation {
  const fields: Partial<Record<ActivityField, ActivityFieldError>> = {};
  const excludeId = context.excludeId ?? null;

  const title = input.title.trim();
  if (!title) fields.title = 'required';
  else if (title.length > ACTIVITY_LIMITS.titleMaxLength) fields.title = 'tooLong';

  const description = input.description.trim();
  if (description.length > ACTIVITY_LIMITS.descriptionMaxLength) fields.description = 'tooLong';

  const { category } = input;
  if (category === null) fields.category = 'required';
  else if (!isCategory(category)) fields.category = 'invalid';

  const { date } = input;
  if (date === null) fields.date = 'required';
  else if (!isLocalDate(date)) fields.date = 'invalid';
  else if (!isTripDay(date, context.trip)) fields.date = 'outsideTrip';
  else {
    const others = context.sameDay.filter((item) => item.id !== excludeId).length;
    if (others >= ACTIVITY_LIMITS.maxActivitiesPerDay) fields.date = 'dayFull';
  }

  const { startTime, endTime } = input;
  const startValid = startTime === null || isLocalTime(startTime);
  if (!startValid) fields.startTime = 'invalid';
  if (endTime !== null) {
    if (!isLocalTime(endTime)) fields.endTime = 'invalid';
    else if (startTime === null) fields.endTime = 'endWithoutStart';
    else if (startValid && endTime <= startTime) fields.endTime = 'invalidRange';
  }

  const { latitude, longitude } = input;
  if (
    (latitude !== null || longitude !== null) &&
    !checkCoordinates({ latitude: latitude ?? undefined, longitude: longitude ?? undefined }).ok
  ) {
    fields.location = 'invalidLocation';
  }

  const address = input.address.trim();
  if (address.length > ACTIVITY_LIMITS.addressMaxLength) fields.address = 'tooLong';

  const notes = input.notes.trim();
  if (notes.length > ACTIVITY_LIMITS.notesMaxLength) fields.notes = 'tooLong';

  let estimatedCost: number | null = null;
  if (!isCurrencyCode(input.currency)) {
    fields.currency = 'invalid';
  } else if (input.estimatedCost.trim()) {
    const amount = parseAmount(input.estimatedCost, input.currency, ACTIVITY_LIMITS.maxCostMajor);
    if (amount.ok) estimatedCost = amount.minor;
    else if (amount.error !== 'required') fields.cost = amount.error;
  }

  if (Object.keys(fields).length > 0 || category === null || !isCategory(category) || date === null) {
    return { ok: false, errors: { fields } };
  }

  const duplicate = findDuplicate({ title, date, startTime }, context.sameDay, excludeId);
  if (duplicate) {
    return {
      ok: false,
      errors: {
        fields: { title: 'duplicate' },
        duplicate: { id: duplicate.id, title: duplicate.title, date: duplicate.date, startTime: duplicate.startTime },
      },
    };
  }

  return {
    ok: true,
    draft: {
      title,
      description,
      category,
      date,
      startTime,
      endTime,
      latitude,
      longitude,
      address,
      estimatedCost,
      currency: input.currency,
      notes,
    },
  };
}
