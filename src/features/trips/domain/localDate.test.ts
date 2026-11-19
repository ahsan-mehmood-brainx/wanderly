import {
  addDays,
  compareLocalDates,
  dayOfWeek,
  daysBetween,
  daysInMonth,
  formatLocalDate,
  isLocalDate,
  localDateAt,
  parseLocalDate,
} from './localDate';

describe('parseLocalDate', () => {
  it('reads a real calendar date', () => {
    expect(parseLocalDate('2028-02-29')).toEqual({ year: 2028, month: 2, day: 29 });
  });

  it.each([
    '2027-02-29',
    '2027-13-01',
    '2027-00-10',
    '2027-04-31',
    '2027-1-1',
    '27-01-01',
    '2027-01-01T00:00',
    '',
    '1899-12-31',
  ])('rejects %s', (value) => expect(isLocalDate(value)).toBe(false));

  it.each([null, undefined, 20270101])('rejects non-strings (%s)', (value) => expect(isLocalDate(value)).toBe(false));
});

describe('date arithmetic', () => {
  it('pads when formatting', () => expect(formatLocalDate({ year: 2027, month: 3, day: 7 })).toBe('2027-03-07'));

  it('knows month lengths, including leap years', () => {
    expect(daysInMonth(2027, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2027, 12)).toBe(31);
  });

  it('adds days across months, years and leap days', () => {
    expect(addDays('2027-12-31', 1)).toBe('2028-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
  });

  it('counts whole days, signed, across daylight-saving changes', () => {
    expect(daysBetween('2027-03-01', '2027-04-01')).toBe(31);
    expect(daysBetween('2027-10-25', '2027-11-05')).toBe(11);
    expect(daysBetween('2027-01-02', '2027-01-01')).toBe(-1);
  });

  it('throws on arithmetic with an invalid date rather than returning nonsense', () => {
    expect(() => addDays('nope', 1)).toThrow(RangeError);
  });

  it('compares chronologically', () => {
    expect(compareLocalDates('2027-01-31', '2027-02-01')).toBe(-1);
    expect(compareLocalDates('2027-02-01', '2027-02-01')).toBe(0);
    expect(compareLocalDates('2028-01-01', '2027-12-31')).toBe(1);
  });

  it('finds the weekday', () => expect(dayOfWeek('2023-01-01')).toBe(0));

  it('uses the device calendar for an instant', () => {
    const noon = new Date(2027, 5, 15, 12).getTime();
    expect(localDateAt(noon)).toBe('2027-06-15');
    expect(localDateAt(new Date(2027, 5, 15, 0, 0, 0).getTime())).toBe('2027-06-15');
    expect(localDateAt(new Date(2027, 5, 15, 23, 59, 59).getTime())).toBe('2027-06-15');
  });
});
