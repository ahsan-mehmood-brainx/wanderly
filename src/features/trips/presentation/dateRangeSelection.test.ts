import { canShiftMonth, selectDay, shiftMonth } from './dateRangeSelection';

describe('selectDay', () => {
  it('sets the start, then the end', () => {
    const first = selectDay({ start: null, end: null }, '2027-07-05');
    expect(first).toEqual({ start: '2027-07-05', end: null });
    expect(selectDay(first, '2027-07-09')).toEqual({ start: '2027-07-05', end: '2027-07-09' });
  });

  it('makes a day trip when the same day is tapped twice', () => {
    expect(selectDay({ start: '2027-07-05', end: null }, '2027-07-05')).toEqual({
      start: '2027-07-05',
      end: '2027-07-05',
    });
  });

  it('moves the start when an earlier day is tapped, so the end can never precede it', () => {
    expect(selectDay({ start: '2027-07-05', end: null }, '2027-07-01')).toEqual({ start: '2027-07-01', end: null });
  });

  it('starts over from a complete range', () => {
    expect(selectDay({ start: '2027-07-05', end: '2027-07-09' }, '2027-08-01')).toEqual({
      start: '2027-08-01',
      end: null,
    });
  });
});

describe('shiftMonth', () => {
  it('moves across year boundaries', () => {
    expect(shiftMonth({ year: 2027, month: 12 }, 1)).toEqual({ year: 2028, month: 1 });
    expect(shiftMonth({ year: 2027, month: 1 }, -1)).toEqual({ year: 2026, month: 12 });
  });

  it('stops at the first and last supported months', () => {
    expect(shiftMonth({ year: 1900, month: 1 }, -1)).toEqual({ year: 1900, month: 1 });
    expect(shiftMonth({ year: 9999, month: 12 }, 1)).toEqual({ year: 9999, month: 12 });
    expect(canShiftMonth({ year: 1900, month: 1 }, -1)).toBe(false);
    expect(canShiftMonth({ year: 1900, month: 1 }, 1)).toBe(true);
    expect(canShiftMonth({ year: 9999, month: 12 }, 1)).toBe(false);
  });
});
