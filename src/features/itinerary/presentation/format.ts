import { type TFunction } from 'i18next';

import { type LocalDate, localDateToUtcMs } from '@/features/trips/domain/localDate';
import { currencyFractionDigits } from '@/features/trips/domain/money';
import { formatBudget } from '@/features/trips/presentation/format';
import { type AppIconName } from '@/shared/ui';

import { type Activity, type ActivityCategory, ACTIVITY_LIMITS } from '../domain/Activity';
import { type ActivityField, type ActivityValidationErrors } from '../domain/activityValidation';
import { durationMinutes, type LocalTime, parseLocalTime } from '../domain/localTime';

export const CATEGORY_ICONS: Readonly<Record<ActivityCategory, AppIconName>> = {
  sightseeing: 'attraction',
  food: 'restaurant',
  shopping: 'shopping',
  transportation: 'transport',
  accommodation: 'hotel',
  entertainment: 'entertainment',
  other: 'pin',
};

/**
 * A wall-clock time in the locale's style (`9:00 AM`, `09:00`). Formatted in UTC
 * from a fixed date so the device's time zone can never shift it.
 */
export function formatTime(time: LocalTime, language: string): string {
  const parts = parseLocalTime(time);
  if (!parts) return time;
  try {
    return new Intl.DateTimeFormat(language, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(
      Date.UTC(2000, 0, 1, parts.hour, parts.minute),
    );
  } catch {
    return time;
  }
}

export function formatTimeRange(start: LocalTime, end: LocalTime | null, language: string): string {
  return end === null ? formatTime(start, language) : `${formatTime(start, language)} – ${formatTime(end, language)}`;
}

/** `45 min`, `2 h`, `1 h 30 min`. */
export function formatDuration(minutes: number, t: TFunction): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return t('itinerary.duration.minutes', { minutes: rest });
  if (rest === 0) return t('itinerary.duration.hours', { hours });
  return t('itinerary.duration.hoursMinutes', { hours, minutes: rest });
}

/** `9:00 AM – 10:30 AM · 1 h 30 min`, a start time alone, or "Any time". */
export function formatActivityTime(
  activity: Pick<Activity, 'startTime' | 'endTime'>,
  language: string,
  t: TFunction,
): string {
  if (activity.startTime === null) return t('itinerary.anyTime');
  const range = formatTimeRange(activity.startTime, activity.endTime, language);
  const minutes = durationMinutes(activity.startTime, activity.endTime);
  return minutes === null ? range : `${range} · ${formatDuration(minutes, t)}`;
}

/**
 * One day-date formatter per language: day lists can label up to a year of days at once,
 * and building an `Intl.DateTimeFormat` is far costlier than calling one. `null` marks a
 * language `Intl` rejects, so it falls back to the ISO date without retrying.
 */
const dayDateFormatters = new Map<string, Intl.DateTimeFormat | null>();

function dayDateFormatter(language: string): Intl.DateTimeFormat | null {
  let formatter = dayDateFormatters.get(language);
  if (formatter === undefined) {
    try {
      formatter = new Intl.DateTimeFormat(language, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      });
    } catch {
      formatter = null;
    }
    dayDateFormatters.set(language, formatter);
  }
  return formatter;
}

/** `Thu, Jul 1`: a trip day without the year, in UTC so it never shifts a day. */
export function formatDayDate(date: LocalDate, language: string): string {
  const formatter = dayDateFormatter(language);
  return formatter ? formatter.format(localDateToUtcMs(date)) : date;
}

/** `Day 2 · Fri, Jul 2`, or just the date for a day outside the trip. */
export function formatDayLabel(date: LocalDate, dayNumber: number | null, language: string, t: TFunction): string {
  const formatted = formatDayDate(date, language);
  return dayNumber === null ? formatted : t('itinerary.dayLabel', { number: dayNumber, date: formatted });
}

export function formatCost(minor: number, currency: string, language: string): string {
  return formatBudget(minor, currency, language);
}

/** The message for a form field's validation error. */
export function activityFieldError(
  field: ActivityField,
  errors: ActivityValidationErrors | null,
  currency: string,
  language: string,
  t: TFunction,
): string | undefined {
  const code = errors?.fields[field];
  if (!code) return undefined;
  switch (field) {
    case 'title': {
      if (code === 'tooLong') return t('itinerary.errors.titleTooLong', { max: ACTIVITY_LIMITS.titleMaxLength });
      const duplicate = errors?.duplicate;
      if (code === 'duplicate' && duplicate) {
        return duplicate.startTime === null
          ? t('itinerary.errors.duplicateUntimed', { title: duplicate.title })
          : t('itinerary.errors.duplicate', {
              title: duplicate.title,
              time: formatTime(duplicate.startTime, language),
            });
      }
      return t('itinerary.errors.titleRequired');
    }
    case 'category':
      return t('itinerary.errors.categoryRequired');
    case 'date':
      switch (code) {
        case 'required':
          return t('itinerary.errors.dateRequired');
        case 'outsideTrip':
          return t('itinerary.errors.dateOutsideTrip');
        case 'dayFull':
          return t('itinerary.errors.dayFull', { max: ACTIVITY_LIMITS.maxActivitiesPerDay });
        default:
          return t('itinerary.errors.dateInvalid');
      }
    case 'startTime':
      return t('itinerary.errors.timeInvalid');
    case 'endTime':
      switch (code) {
        case 'endWithoutStart':
          return t('itinerary.errors.endWithoutStart');
        case 'invalidRange':
          return t('itinerary.errors.invalidRange');
        default:
          return t('itinerary.errors.timeInvalid');
      }
    case 'location':
      return t('itinerary.errors.locationInvalid');
    case 'address':
      return t('itinerary.errors.addressTooLong', { max: ACTIVITY_LIMITS.addressMaxLength });
    case 'description':
      return t('itinerary.errors.descriptionTooLong', { max: ACTIVITY_LIMITS.descriptionMaxLength });
    case 'notes':
      return t('itinerary.errors.notesTooLong', { max: ACTIVITY_LIMITS.notesMaxLength });
    case 'currency':
      return t('itinerary.errors.currencyInvalid');
    case 'cost':
      switch (code) {
        case 'tooManyDecimals':
          return currencyFractionDigits(currency) === 0
            ? t('itinerary.errors.costNoDecimals', { currency })
            : t('itinerary.errors.costDecimals', { count: currencyFractionDigits(currency) });
        case 'notPositive':
          return t('itinerary.errors.costNotPositive');
        case 'tooLarge':
          return t('itinerary.errors.costTooLarge');
        default:
          return t('itinerary.errors.costInvalid');
      }
  }
}
