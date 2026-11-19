import { type TFunction } from 'i18next';

import { type LocalDate, localDateToUtcMs } from '../domain/localDate';
import { currencyFractionDigits, minorToMajor } from '../domain/money';
import { type TripField, type TripFieldError, type TripValidationErrors } from '../domain/tripValidation';
import { TRIP_LIMITS } from '../domain/Trip';
import { type TripTimeline } from '../domain/tripStatus';

/** Formats a calendar date in UTC, the zone `localDateToUtcMs` anchors it to, so it never shifts a day. */
export function formatTripDate(
  date: LocalDate,
  language: string,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' },
): string {
  try {
    return new Intl.DateTimeFormat(language, { ...options, timeZone: 'UTC' }).format(localDateToUtcMs(date));
  } catch {
    return date;
  }
}

/** `12 Mar 2027`, or `12 Mar – 3 Apr 2027`; the first year is shown only when the trip spans two. */
export function formatTripDates(startDate: LocalDate, endDate: LocalDate, language: string): string {
  if (startDate === endDate) return formatTripDate(startDate, language);
  const sameYear = startDate.slice(0, 4) === endDate.slice(0, 4);
  const start = sameYear
    ? formatTripDate(startDate, language, { day: 'numeric', month: 'short' })
    : formatTripDate(startDate, language);
  return `${start} – ${formatTripDate(endDate, language)}`;
}

export function formatBudget(minor: number, currency: string, language: string): string {
  const major = minorToMajor(minor, currency);
  const digits = currencyFractionDigits(currency);
  try {
    return new Intl.NumberFormat(language, {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(major);
  } catch {
    return `${major.toFixed(digits)} ${currency}`;
  }
}

export function timelineLabel(timeline: TripTimeline, t: TFunction): string {
  switch (timeline.kind) {
    case 'startsIn':
      return t('trips.timeline.startsIn', { count: timeline.days });
    case 'inProgress':
      return t('trips.timeline.inProgress', { day: timeline.day, total: timeline.of });
    case 'endedAgo':
      return t('trips.timeline.endedAgo', { count: timeline.days });
    case 'cancelled':
      return t('trips.status.cancelled');
  }
}

/** The message for a field's validation error. */
export function fieldErrorMessage(
  field: TripField,
  errors: TripValidationErrors | null,
  currency: string,
  language: string,
  t: TFunction,
): string | undefined {
  const code: TripFieldError | undefined = errors?.fields[field];
  if (!code) return undefined;
  switch (field) {
    case 'title':
      return code === 'tooLong'
        ? t('trips.errors.titleTooLong', { max: TRIP_LIMITS.titleMaxLength })
        : t('trips.errors.titleRequired');
    case 'destination':
      return code === 'tooLong'
        ? t('trips.errors.destinationTooLong', { max: TRIP_LIMITS.destinationNameMaxLength })
        : t('trips.errors.destinationRequired');
    case 'description':
      return t('trips.errors.descriptionTooLong', { max: TRIP_LIMITS.descriptionMaxLength });
    case 'currency':
      return t('trips.errors.currencyInvalid');
    case 'dates':
      switch (code) {
        case 'endBeforeStart':
          return t('trips.errors.datesEndBeforeStart');
        case 'tooManyDays':
          return t('trips.errors.datesTooLong', { max: TRIP_LIMITS.maxDurationDays });
        case 'overlap': {
          const conflict = errors?.conflict;
          return conflict
            ? t('trips.errors.datesOverlap', {
                title: conflict.title,
                dates: formatTripDates(conflict.startDate, conflict.endDate, language),
              })
            : t('trips.errors.datesInvalid');
        }
        case 'required':
          return t('trips.errors.datesRequired');
        default:
          return t('trips.errors.datesInvalid');
      }
    case 'budget':
      switch (code) {
        case 'required':
          return t('trips.errors.budgetRequired');
        case 'tooManyDecimals':
          return currencyFractionDigits(currency) === 0
            ? t('trips.errors.budgetNoDecimals', { currency })
            : t('trips.errors.budgetDecimals', { count: currencyFractionDigits(currency) });
        case 'notPositive':
          return t('trips.errors.budgetNotPositive');
        case 'tooLarge':
          return t('trips.errors.budgetTooLarge');
        default:
          return t('trips.errors.budgetInvalid');
      }
  }
}
