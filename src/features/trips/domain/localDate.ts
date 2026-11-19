/**
 * A calendar date with no time or time zone: `YYYY-MM-DD` (ISO 8601).
 *
 * Trip dates are days on the traveller's calendar ("12 March"), not instants.
 * Storing them as plain dates means a trip doesn't move a day when the device
 * changes time zone, and the strings sort and compare correctly as text.
 */
export type LocalDate = string;

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export interface DateParts {
  readonly year: number;
  /** 1–12. */
  readonly month: number;
  /** 1–31. */
  readonly day: number;
}

/** Parses a strict `YYYY-MM-DD` that exists on the calendar (no 30 February), years 1900–9999. */
export function parseLocalDate(value: unknown): DateParts | null {
  if (typeof value !== 'string') return null;
  const match = LOCAL_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function isLocalDate(value: unknown): value is LocalDate {
  return parseLocalDate(value) !== null;
}

export function formatLocalDate({ year, month, day }: DateParts): LocalDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one (UTC, so no DST surprises).
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The date on the device's calendar at `epochMs` (its current time zone). */
export function localDateAt(epochMs: number): LocalDate {
  const date = new Date(epochMs);
  return formatLocalDate({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() });
}

/** Midnight UTC of the date; only for day arithmetic, never shown. */
function toUtcDay(date: LocalDate): number {
  const parts = parseLocalDate(date);
  if (!parts) throw new RangeError(`Not a calendar date: ${date}`);
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

function fromUtcDay(ms: number): LocalDate {
  const date = new Date(ms);
  return formatLocalDate({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() });
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromUtcDay(toUtcDay(date) + days * MS_PER_DAY);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). DST never makes it fractional. */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.round((toUtcDay(to) - toUtcDay(from)) / MS_PER_DAY);
}

export function compareLocalDates(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(date: LocalDate): number {
  return new Date(toUtcDay(date)).getUTCDay();
}

/** UTC midnight of the date as epoch ms, for `Intl.DateTimeFormat(…, { timeZone: 'UTC' })` display. */
export function localDateToUtcMs(date: LocalDate): number {
  return toUtcDay(date);
}
