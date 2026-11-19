import { storedTrip, tripInput } from '@/testing/tripFixtures';

import { TRIP_LIMITS } from './Trip';
import { findOverlappingTrip, tripsOverlap, validateTripInput } from './tripValidation';

const fieldsOf = (overrides: Parameters<typeof tripInput>[0]) => {
  const result = validateTripInput(tripInput(overrides));
  return result.ok ? {} : result.errors.fields;
};

describe('validateTripInput', () => {
  it('returns a clean draft: trimmed text and the budget in minor units', () => {
    const result = validateTripInput(
      tripInput({
        title: '  Lisbon  ',
        description: ' sun ',
        destination: { id: ' country-pt ', name: ' Portugal ' },
        budget: '12.50',
      }),
    );
    expect(result).toEqual({
      ok: true,
      draft: expect.objectContaining({
        title: 'Lisbon',
        description: 'sun',
        destination: { id: 'country-pt', name: 'Portugal' },
        budget: 1250,
      }),
    });
  });

  it('reports every problem at once', () => {
    expect(fieldsOf({ title: ' ', destination: null, startDate: null, endDate: null, budget: '' })).toEqual({
      title: 'required',
      destination: 'required',
      dates: 'required',
      budget: 'required',
    });
  });

  it('requires a title and caps its length', () => {
    expect(fieldsOf({ title: '   ' }).title).toBe('required');
    expect(fieldsOf({ title: 'x'.repeat(TRIP_LIMITS.titleMaxLength) }).title).toBeUndefined();
    expect(fieldsOf({ title: 'x'.repeat(TRIP_LIMITS.titleMaxLength + 1) }).title).toBe('tooLong');
  });

  it('requires a destination with a name', () => {
    expect(fieldsOf({ destination: null }).destination).toBe('required');
    expect(fieldsOf({ destination: { id: 'x', name: '  ' } }).destination).toBe('required');
    expect(fieldsOf({ destination: { id: ' ', name: 'Rome' } }).destination).toBe('required');
  });

  it('rejects an end date before the start date, and accepts a one-day trip', () => {
    expect(fieldsOf({ startDate: '2027-07-05', endDate: '2027-07-04' }).dates).toBe('endBeforeStart');
    expect(fieldsOf({ startDate: '2027-07-05', endDate: '2027-07-05' }).dates).toBeUndefined();
  });

  it('needs both dates, real ones, within the longest allowed trip', () => {
    expect(fieldsOf({ endDate: null }).dates).toBe('required');
    expect(fieldsOf({ startDate: null }).dates).toBe('required');
    expect(fieldsOf({ startDate: '2027-02-30' }).dates).toBe('invalid');
    expect(fieldsOf({ startDate: '2027-01-01', endDate: '2028-01-01' }).dates).toBeUndefined();
    expect(fieldsOf({ startDate: '2027-01-01', endDate: '2028-01-02' }).dates).toBe('tooManyDays');
  });

  it.each([
    ['', 'required'],
    ['abc', 'invalidAmount'],
    ['-1', 'invalidAmount'],
    ['0', 'notPositive'],
    ['1.234', 'tooManyDecimals'],
    ['10000001', 'tooLarge'],
  ])('rejects the budget "%s" as %s', (budget, error) => {
    expect(fieldsOf({ budget }).budget).toBe(error);
  });

  it('requires a currency code', () => expect(fieldsOf({ currency: 'dollars' }).currency).toBe('invalid'));

  it('caps the description', () => {
    expect(fieldsOf({ description: 'x'.repeat(TRIP_LIMITS.descriptionMaxLength + 1) }).description).toBe('tooLong');
  });
});

describe('tripsOverlap (the product rule)', () => {
  const range = (startDate: string, endDate: string) => ({ startDate, endDate });
  const base = range('2027-07-10', '2027-07-15');

  it.each([
    ['identical', range('2027-07-10', '2027-07-15')],
    ['inside', range('2027-07-11', '2027-07-12')],
    ['around', range('2027-07-01', '2027-07-20')],
    ['across the start', range('2027-07-08', '2027-07-11')],
    ['across the end', range('2027-07-14', '2027-07-18')],
    ['a day trip in the middle', range('2027-07-12', '2027-07-12')],
  ])('%s overlaps, in either order', (_name, other) => {
    expect(tripsOverlap(base, other)).toBe(true);
    expect(tripsOverlap(other, base)).toBe(true);
  });

  it.each([
    ['entirely before', range('2027-07-01', '2027-07-05')],
    ['entirely after', range('2027-07-20', '2027-07-25')],
    ['ending the day this starts', range('2027-07-05', '2027-07-10')],
    ['starting the day this ends', range('2027-07-15', '2027-07-20')],
    ['a day trip on the first day', range('2027-07-10', '2027-07-10')],
    ['a day trip on the last day', range('2027-07-15', '2027-07-15')],
  ])('%s does not overlap', (_name, other) => {
    expect(tripsOverlap(base, other)).toBe(false);
    expect(tripsOverlap(other, base)).toBe(false);
  });

  it('lets two day trips share a date', () => {
    expect(tripsOverlap(range('2027-07-10', '2027-07-10'), range('2027-07-10', '2027-07-10'))).toBe(false);
  });
});

describe('findOverlappingTrip', () => {
  const range = { startDate: '2027-07-02', endDate: '2027-07-20' };
  const later = storedTrip({ id: 'later', startDate: '2027-07-10', endDate: '2027-07-12' });
  const earlier = storedTrip({ id: 'earlier', startDate: '2027-07-01', endDate: '2027-07-05' });

  it('returns the earliest conflict', () => {
    expect(findOverlappingTrip(range, [later, earlier], null)?.id).toBe('earlier');
  });

  it('ignores the trip being edited and cancelled trips', () => {
    expect(findOverlappingTrip(range, [earlier, later], 'earlier')?.id).toBe('later');
    expect(findOverlappingTrip(range, [{ ...earlier, cancelledAt: 1 }], null)).toBeNull();
  });
});
