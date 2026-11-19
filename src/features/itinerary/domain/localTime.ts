/**
 * A wall-clock time at the destination with no time zone: `HH:mm`, 24-hour.
 * Like `LocalDate`, it never shifts when the device changes time zone.
 */
export type LocalTime = string;

export interface TimeParts {
  /** 0–23. */
  readonly hour: number;
  /** 0–59. */
  readonly minute: number;
}

const LOCAL_TIME = /^(\d{2}):(\d{2})$/;

/** Parses a strict `HH:mm` (00:00–23:59). */
export function parseLocalTime(value: unknown): TimeParts | null {
  if (typeof value !== 'string') return null;
  const match = LOCAL_TIME.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

export function isLocalTime(value: unknown): value is LocalTime {
  return parseLocalTime(value) !== null;
}

export function formatLocalTime({ hour, minute }: TimeParts): LocalTime {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Minutes since midnight. */
export function toMinutes(time: LocalTime): number {
  const parts = parseLocalTime(time);
  if (!parts) throw new RangeError(`Not a local time: ${time}`);
  return parts.hour * 60 + parts.minute;
}

/** Minutes from `start` to `end`, or `null` unless both are set and `end` is later. */
export function durationMinutes(start: LocalTime | null, end: LocalTime | null): number | null {
  if (!isLocalTime(start) || !isLocalTime(end)) return null;
  const minutes = toMinutes(end) - toMinutes(start);
  return minutes > 0 ? minutes : null;
}
