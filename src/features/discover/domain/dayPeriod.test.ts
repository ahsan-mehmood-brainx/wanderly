import { getDayPeriod } from './dayPeriod';

describe('getDayPeriod', () => {
  it.each([
    [5, 'morning'],
    [11, 'morning'],
    [12, 'afternoon'],
    [17, 'afternoon'],
    [18, 'evening'],
    [23, 'evening'],
    [0, 'evening'],
    [4, 'evening'],
  ] as const)('maps hour %i to %s', (hour, period) => {
    expect(getDayPeriod(hour)).toBe(period);
  });
});
