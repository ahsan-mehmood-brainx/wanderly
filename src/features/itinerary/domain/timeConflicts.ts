import { type Activity } from './Activity';
import { durationMinutes, toMinutes } from './localTime';

export type ConflictCandidate = Pick<Activity, 'id' | 'date' | 'startTime' | 'endTime'>;

interface TimedSlot {
  readonly id: string;
  readonly date: string;
  readonly start: number;
  readonly end: number;
}

/**
 * For each activity that overlaps another on the same day, the ids of those it
 * overlaps (in input order). Only activities with both times take part, and
 * back-to-back activities don't overlap. Activities without a conflict are absent.
 */
export function findTimeConflicts(activities: readonly ConflictCandidate[]): ReadonlyMap<string, readonly string[]> {
  const timed: TimedSlot[] = [];
  // Only activities on the same day can overlap, so each is compared with its own day only.
  const byDate = new Map<string, TimedSlot[]>();
  for (const { id, date, startTime, endTime } of activities) {
    if (startTime === null || endTime === null || durationMinutes(startTime, endTime) === null) continue;
    const slot = { id, date, start: toMinutes(startTime), end: toMinutes(endTime) };
    timed.push(slot);
    const day = byDate.get(date);
    if (day) day.push(slot);
    else byDate.set(date, [slot]);
  }

  const conflicts = new Map<string, string[]>();
  for (const a of timed) {
    for (const b of byDate.get(a.date) ?? []) {
      if (a === b) continue;
      if (a.start < b.end && b.start < a.end) {
        const list = conflicts.get(a.id);
        if (list) list.push(b.id);
        else conflicts.set(a.id, [b.id]);
      }
    }
  }
  return conflicts;
}
