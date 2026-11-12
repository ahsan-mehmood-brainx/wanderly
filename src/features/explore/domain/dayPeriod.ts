export type DayPeriod = 'morning' | 'afternoon' | 'evening';

/** Maps a local hour (0–23) to a greeting period. Night hours count as evening. */
export function getDayPeriod(hour: number): DayPeriod {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}
