import { type ConflictCandidate, findTimeConflicts } from './timeConflicts';

const slot = (
  id: string,
  startTime: string | null,
  endTime: string | null,
  date = '2027-07-01',
): ConflictCandidate => ({
  id,
  date,
  startTime,
  endTime,
});

describe('findTimeConflicts', () => {
  it('pairs activities that overlap, in both directions', () => {
    const conflicts = findTimeConflicts([slot('museum', '09:00', '11:00'), slot('lunch', '10:30', '12:00')]);
    expect(conflicts.get('museum')).toEqual(['lunch']);
    expect(conflicts.get('lunch')).toEqual(['museum']);
  });

  it('lets back-to-back activities touch', () => {
    const conflicts = findTimeConflicts([slot('a', '10:00', '11:00'), slot('b', '11:00', '12:00')]);
    expect(conflicts.size).toBe(0);
  });

  it('finds an activity inside another and lists every overlap in input order', () => {
    const conflicts = findTimeConflicts([
      slot('day', '08:00', '18:00'),
      slot('coffee', '09:00', '09:30'),
      slot('dinner', '19:00', '21:00'),
      slot('show', '17:00', '19:30'),
    ]);
    expect(conflicts.get('day')).toEqual(['coffee', 'show']);
    expect(conflicts.get('coffee')).toEqual(['day']);
    expect(conflicts.get('show')).toEqual(['day', 'dinner']);
    expect(conflicts.get('dinner')).toEqual(['show']);
  });

  it('treats identical times as overlapping', () => {
    const conflicts = findTimeConflicts([slot('a', '14:00', '15:00'), slot('b', '14:00', '15:00')]);
    expect(conflicts.get('a')).toEqual(['b']);
  });

  it('ignores activities without both times', () => {
    const conflicts = findTimeConflicts([
      slot('timed', '09:00', '12:00'),
      slot('startOnly', '10:00', null),
      slot('untimed', null, null),
    ]);
    expect(conflicts.size).toBe(0);
  });

  it('only compares activities on the same day', () => {
    const conflicts = findTimeConflicts([
      slot('first', '09:00', '11:00', '2027-07-01'),
      slot('second', '09:00', '11:00', '2027-07-02'),
    ]);
    expect(conflicts.size).toBe(0);
  });

  it('returns an empty map for no activities', () => {
    expect(findTimeConflicts([]).size).toBe(0);
  });
});
