import { dayNumberOf, tripDays } from './itinerary';
import { findTimeConflicts } from './timeConflicts';

const trip = { startDate: '2027-07-01', endDate: '2027-07-04' };

describe('dayNumberOf', () => {
  it('numbers trip days from 1', () => {
    expect(dayNumberOf(trip, '2027-07-01')).toBe(1);
    expect(dayNumberOf(trip, '2027-07-03')).toBe(3);
    expect(dayNumberOf(trip, '2027-07-04')).toBe(4);
  });

  it('agrees with tripDays across a month boundary', () => {
    const long = { startDate: '2027-01-28', endDate: '2027-03-02' };
    tripDays(long).forEach((date, index) => expect(dayNumberOf(long, date)).toBe(index + 1));
  });

  it('is null outside the trip', () => {
    expect(dayNumberOf(trip, '2027-06-30')).toBeNull();
    expect(dayNumberOf(trip, '2027-07-05')).toBeNull();
  });
});

describe('findTimeConflicts across many days', () => {
  it('only pairs activities of the same day, in input order', () => {
    const slot = (id: string, date: string, startTime: string, endTime: string) => ({ id, date, startTime, endTime });
    const conflicts = findTimeConflicts([
      slot('a', '2027-07-01', '09:00', '11:00'),
      slot('x', '2027-07-02', '09:30', '10:30'),
      slot('b', '2027-07-01', '10:00', '12:00'),
      slot('c', '2027-07-01', '10:30', '11:30'),
      slot('y', '2027-07-02', '10:00', '11:00'),
    ]);

    expect([...conflicts.entries()]).toEqual([
      ['a', ['b', 'c']],
      ['x', ['y']],
      ['b', ['a', 'c']],
      ['c', ['a', 'b']],
      ['y', ['x']],
    ]);
  });
});
