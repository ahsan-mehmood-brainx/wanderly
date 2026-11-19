import { activity, activityInput, ITINERARY_TRIP } from '@/testing/itineraryFixtures';

import { ACTIVITY_LIMITS } from './Activity';
import { validateActivityInput } from './activityValidation';
import { costTotals, dayTimeSpan, groupByDay, insertionIndex, tripDays } from './itinerary';
import { durationMinutes, parseLocalTime } from './localTime';
import { findTimeConflicts } from './timeConflicts';

/** ITINERARY_TRIP runs 2027-07-01 to 2027-07-05. */
const trip = ITINERARY_TRIP;
const validate = (overrides: Parameters<typeof activityInput>[0], sameDay = [] as ReturnType<typeof activity>[]) =>
  validateActivityInput(activityInput(overrides), { trip, sameDay });
const fieldsOf = (result: ReturnType<typeof validate>) => (result.ok ? {} : result.errors.fields);

describe('times at the midnight boundaries', () => {
  it('accepts an activity from 00:00 to 23:55 on one day', () => {
    const result = validate({ startTime: '00:00', endTime: '23:55' });
    expect(result.ok).toBe(true);
    expect(durationMinutes('00:00', '23:55')).toBe(23 * 60 + 55);
  });

  it('refuses 24:00 and single-digit hours instead of treating them as times', () => {
    expect(parseLocalTime('24:00')).toBeNull();
    expect(parseLocalTime('9:00')).toBeNull();
    expect(fieldsOf(validate({ startTime: '23:00', endTime: '24:00' })).endTime).toBe('invalid');
  });

  it('refuses an overnight activity whose end is past midnight (end before start)', () => {
    expect(fieldsOf(validate({ startTime: '22:00', endTime: '01:00' })).endTime).toBe('invalidRange');
  });

  it('refuses an end time equal to the start time', () => {
    expect(fieldsOf(validate({ startTime: '10:00', endTime: '10:00' })).endTime).toBe('invalidRange');
  });
});

describe('trip date boundaries', () => {
  it("accepts the trip's first and last day and refuses the days just outside", () => {
    expect(validate({ date: '2027-07-01' }).ok).toBe(true);
    expect(validate({ date: '2027-07-05' }).ok).toBe(true);
    expect(fieldsOf(validate({ date: '2027-06-30' })).date).toBe('outsideTrip');
    expect(fieldsOf(validate({ date: '2027-07-06' })).date).toBe('outsideTrip');
  });

  it('accepts the only day of a one-day trip', () => {
    const dayTrip = { startDate: '2027-07-01', endDate: '2027-07-01' };
    expect(validateActivityInput(activityInput(), { trip: dayTrip, sameDay: [] }).ok).toBe(true);
    expect(tripDays(dayTrip)).toEqual(['2027-07-01']);
  });

  it('lists every day across a daylight-saving change and a year end without skipping or repeating one', () => {
    expect(tripDays({ startDate: '2027-03-13', endDate: '2027-03-15' })).toEqual([
      '2027-03-13',
      '2027-03-14',
      '2027-03-15',
    ]);
    expect(tripDays({ startDate: '2027-10-30', endDate: '2027-11-01' })).toEqual([
      '2027-10-30',
      '2027-10-31',
      '2027-11-01',
    ]);
    expect(tripDays({ startDate: '2027-12-31', endDate: '2028-01-01' })).toEqual(['2027-12-31', '2028-01-01']);
    expect(tripDays({ startDate: '2028-02-28', endDate: '2028-03-01' })).toEqual([
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
    ]);
  });

  it('has no days when the end is before the start', () => {
    expect(tripDays({ startDate: '2027-07-05', endDate: '2027-07-01' })).toEqual([]);
  });

  it('puts every activity outside the trip when the trip dates move away entirely', () => {
    const moved = { startDate: '2027-09-01', endDate: '2027-09-02' };
    const groups = groupByDay(
      [activity({ id: 'b', date: '2027-07-02' }), activity({ id: 'a', date: '2027-07-01' })],
      moved,
    );
    expect(groups.days.every((day) => day.activities.length === 0)).toBe(true);
    expect(groups.outsideTrip.map(({ id }) => id)).toEqual(['a', 'b']);
  });
});

describe('very long and empty input', () => {
  it('measures the title after trimming, so padding never makes it too long', () => {
    const title = 'x'.repeat(ACTIVITY_LIMITS.titleMaxLength);
    expect(validate({ title: `   ${title}   ` }).ok).toBe(true);
    expect(fieldsOf(validate({ title: `${title}y` })).title).toBe('tooLong');
  });

  it('refuses a title made only of whitespace and line breaks', () => {
    expect(fieldsOf(validate({ title: ' \n\t ' })).title).toBe('required');
  });

  it('accepts notes, description and address at their limits and refuses one character more', () => {
    const ok = validate({
      notes: 'n'.repeat(ACTIVITY_LIMITS.notesMaxLength),
      description: 'd'.repeat(ACTIVITY_LIMITS.descriptionMaxLength),
      address: 'a'.repeat(ACTIVITY_LIMITS.addressMaxLength),
    });
    expect(ok.ok).toBe(true);
    expect(
      fieldsOf(
        validate({
          notes: 'n'.repeat(ACTIVITY_LIMITS.notesMaxLength + 1),
          description: 'd'.repeat(ACTIVITY_LIMITS.descriptionMaxLength + 1),
          address: 'a'.repeat(ACTIVITY_LIMITS.addressMaxLength + 1),
        }),
      ),
    ).toEqual({ notes: 'tooLong', description: 'tooLong', address: 'tooLong' });
  });

  it('treats a cost of only spaces as no cost', () => {
    const result = validate({ estimatedCost: '   ' });
    expect(result.ok && result.draft.estimatedCost).toBeNull();
  });
});

describe('cost edge cases', () => {
  it('refuses a zero cost (a free activity leaves the cost empty)', () => {
    expect(fieldsOf(validate({ estimatedCost: '0' })).cost).toBe('notPositive');
  });

  it('refuses decimals for a currency without minor units', () => {
    expect(fieldsOf(validate({ estimatedCost: '100.5', currency: 'JPY' })).cost).toBe('tooManyDecimals');
    const yen = validate({ estimatedCost: '1500', currency: 'JPY' });
    expect(yen.ok && yen.draft.estimatedCost).toBe(1500);
  });

  it('accepts a comma decimal separator and refuses a negative or over-maximum amount', () => {
    const comma = validate({ estimatedCost: '12,5' });
    expect(comma.ok && comma.draft.estimatedCost).toBe(1250);
    expect(fieldsOf(validate({ estimatedCost: '-5' })).cost).toBe('invalidAmount');
    expect(fieldsOf(validate({ estimatedCost: '1000000.01' })).cost).toBe('tooLarge');
  });
});

describe('location edge cases', () => {
  it('refuses only one coordinate, NaN, and 0,0 (a missing value defaulted to zero)', () => {
    expect(fieldsOf(validate({ latitude: 38.7, longitude: null })).location).toBe('invalidLocation');
    expect(fieldsOf(validate({ latitude: Number.NaN, longitude: 9.1 })).location).toBe('invalidLocation');
    expect(fieldsOf(validate({ latitude: 0, longitude: 0 })).location).toBe('invalidLocation');
  });
});

describe('duplicates', () => {
  const existing = activity({ id: 'tower', title: 'Belém Tower', startTime: '09:00', endTime: '10:30' });

  it('is not a duplicate when one of the two is untimed', () => {
    expect(validate({ title: 'Belém Tower', startTime: null, endTime: null }, [existing]).ok).toBe(true);
  });

  it('ignores a different end time when the title and start time match', () => {
    const result = validate({ title: 'belém tower ', startTime: '09:00', endTime: '12:00' }, [existing]);
    expect(fieldsOf(result).title).toBe('duplicate');
  });

  it('reports field errors before looking for a duplicate', () => {
    const result = validate({ title: 'Belém Tower', startTime: '09:00', endTime: '08:00' }, [existing]);
    expect(fieldsOf(result)).toEqual({ endTime: 'invalidRange' });
  });
});

describe('a full day', () => {
  const full = Array.from({ length: ACTIVITY_LIMITS.maxActivitiesPerDay }, (_, index) =>
    activity({ id: `a${index}`, title: `Activity ${index}`, sortOrder: index, startTime: null, endTime: null }),
  );

  it('refuses one more activity, but lets one already on that day be edited', () => {
    expect(fieldsOf(validate({ title: 'One more' }, full)).date).toBe('dayFull');
    const edit = validateActivityInput(activityInput({ title: 'Renamed' }), {
      trip,
      sameDay: full,
      excludeId: 'a3',
    });
    expect(edit.ok).toBe(true);
  });

  it('allows the 50th activity', () => {
    expect(validate({ title: 'Last one' }, full.slice(1)).ok).toBe(true);
  });
});

describe('time conflicts edge cases', () => {
  it('ignores rows with an end not after the start instead of flagging or throwing', () => {
    const conflicts = findTimeConflicts([
      activity({ id: 'broken', startTime: '11:00', endTime: '10:00' }),
      activity({ id: 'ok', startTime: '10:00', endTime: '12:00' }),
    ]);
    expect(conflicts.size).toBe(0);
  });

  it('flags a one-minute overlap but not touching at midnight-adjacent times', () => {
    const conflicts = findTimeConflicts([
      activity({ id: 'a', startTime: '23:00', endTime: '23:31' }),
      activity({ id: 'b', startTime: '23:30', endTime: '23:55' }),
      activity({ id: 'c', startTime: '00:00', endTime: '23:00' }),
    ]);
    expect(conflicts.get('a')).toEqual(['b']);
    expect(conflicts.get('b')).toEqual(['a']);
    expect(conflicts.has('c')).toBe(false);
  });

  it('flags three activities that all overlap one another', () => {
    const conflicts = findTimeConflicts([
      activity({ id: 'a', startTime: '09:00', endTime: '12:00' }),
      activity({ id: 'b', startTime: '10:00', endTime: '11:00' }),
      activity({ id: 'c', startTime: '10:30', endTime: '13:00' }),
    ]);
    expect(conflicts.get('a')).toEqual(['b', 'c']);
    expect(conflicts.get('b')).toEqual(['a', 'c']);
    expect(conflicts.get('c')).toEqual(['a', 'b']);
  });
});

describe('ordering and summaries', () => {
  it('places a new timed activity before untimed ones in the middle of the day', () => {
    const day = [
      activity({ startTime: '09:00' }),
      activity({ startTime: null, endTime: null }),
      activity({ startTime: '15:00' }),
    ];
    expect(insertionIndex(day, '10:00')).toBe(1);
    expect(insertionIndex(day, '16:00')).toBe(3);
    expect(insertionIndex(day, '09:00')).toBe(1);
  });

  it('spans from the earliest start to the latest end even when a start-only activity runs latest', () => {
    expect(
      dayTimeSpan([
        { startTime: '09:00', endTime: '10:00' },
        { startTime: '21:00', endTime: null },
        { startTime: null, endTime: null },
      ]),
    ).toEqual({ start: '09:00', end: '21:00' });
  });

  it('sorts currency totals by code and keeps currencies apart', () => {
    expect(
      costTotals([
        { estimatedCost: 500, currency: 'USD' },
        { estimatedCost: 1000, currency: 'EUR' },
        { estimatedCost: 250, currency: 'USD' },
        { estimatedCost: 3000, currency: 'JPY' },
        { estimatedCost: null, currency: 'GBP' },
      ]),
    ).toEqual([
      { currency: 'EUR', minor: 1000 },
      { currency: 'JPY', minor: 3000 },
      { currency: 'USD', minor: 750 },
    ]);
  });
});
