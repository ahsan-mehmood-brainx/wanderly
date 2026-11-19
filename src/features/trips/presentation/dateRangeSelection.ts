import { type LocalDate } from '../domain/localDate';

export interface DateRangeSelection {
  readonly start: LocalDate | null;
  readonly end: LocalDate | null;
}

/**
 * What a tap on a day does: the first tap sets the start, the next sets the end.
 * A tap before the start moves the start instead, so the calendar can't produce
 * an end before the start. With a full range, a tap begins a new one.
 */
export function selectDay({ start, end }: DateRangeSelection, day: LocalDate): DateRangeSelection {
  if (start === null || end !== null || day < start) return { start: day, end: null };
  return { start, end: day };
}

export interface CalendarMonth {
  readonly year: number;
  /** 1–12. */
  readonly month: number;
}

/** The months the calendar can show: the years `LocalDate` supports. */
const FIRST_MONTH_INDEX = 1900 * 12;
const LAST_MONTH_INDEX = 9999 * 12 + 11;

const monthIndex = ({ year, month }: CalendarMonth) => year * 12 + month - 1;

/** `delta` months later (earlier when negative), kept within the supported years. */
export function shiftMonth(current: CalendarMonth, delta: number): CalendarMonth {
  const index = Math.min(LAST_MONTH_INDEX, Math.max(FIRST_MONTH_INDEX, monthIndex(current) + delta));
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function canShiftMonth(current: CalendarMonth, delta: number): boolean {
  return monthIndex(shiftMonth(current, delta)) !== monthIndex(current);
}
