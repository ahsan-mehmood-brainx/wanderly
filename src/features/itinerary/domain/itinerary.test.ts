import { activity } from '@/testing/itineraryFixtures';

import { costTotals, dayTimeSpan, groupByDay, insertionIndex, progress, tripDays } from './itinerary';

const trip = { startDate: '2027-07-01', endDate: '2027-07-03' };

describe('tripDays', () => {
  it('lists every day of the trip, both ends included', () => {
    expect(tripDays(trip)).toEqual(['2027-07-01', '2027-07-02', '2027-07-03']);
  });

  it('has one day for a day trip and crosses month ends', () => {
    expect(tripDays({ startDate: '2027-07-01', endDate: '2027-07-01' })).toEqual(['2027-07-01']);
    expect(tripDays({ startDate: '2027-02-27', endDate: '2027-03-01' })).toEqual([
      '2027-02-27',
      '2027-02-28',
      '2027-03-01',
    ]);
  });
});

describe('groupByDay', () => {
  it('puts activities on their day in sortOrder, numbers days and keeps empty ones', () => {
    const groups = groupByDay(
      [
        activity({ id: 'late', date: '2027-07-01', sortOrder: 1 }),
        activity({ id: 'third', date: '2027-07-03', sortOrder: 0 }),
        activity({ id: 'early', date: '2027-07-01', sortOrder: 0 }),
      ],
      trip,
    );

    expect(
      groups.days.map(({ date, dayNumber, activities }) => [date, dayNumber, activities.map(({ id }) => id)]),
    ).toEqual([
      ['2027-07-01', 1, ['early', 'late']],
      ['2027-07-02', 2, []],
      ['2027-07-03', 3, ['third']],
    ]);
    expect(groups.outsideTrip).toEqual([]);
  });

  it('keeps activities that fall outside the trip dates apart, by date', () => {
    const groups = groupByDay(
      [
        activity({ id: 'after', date: '2027-07-09' }),
        activity({ id: 'inside', date: '2027-07-02' }),
        activity({ id: 'before', date: '2027-06-28' }),
      ],
      trip,
    );

    expect(groups.outsideTrip.map(({ id }) => id)).toEqual(['before', 'after']);
    expect(groups.days.flatMap((day) => day.activities.map(({ id }) => id))).toEqual(['inside']);
  });
});

describe('insertionIndex', () => {
  const day = [
    activity({ id: 'a', startTime: '09:00' }),
    activity({ id: 'free', startTime: null, endTime: null }),
    activity({ id: 'c', startTime: '11:00' }),
  ];

  it('goes after the last activity starting at or before it', () => {
    expect(insertionIndex(day, '10:00')).toBe(1);
    expect(insertionIndex(day, '11:00')).toBe(3);
    expect(insertionIndex(day, '12:00')).toBe(3);
  });

  it('goes first when it starts before everything', () => {
    expect(insertionIndex(day, '08:00')).toBe(0);
  });

  it('puts untimed activities at the end, and anything into an empty day first', () => {
    expect(insertionIndex(day, null)).toBe(3);
    expect(insertionIndex([], '10:00')).toBe(0);
    expect(insertionIndex([], null)).toBe(0);
  });
});

describe('progress', () => {
  it('counts completed activities', () => {
    const items = [true, true, true, false, false, false, false, false].map((isCompleted) => ({ isCompleted }));
    expect(progress(items)).toEqual({ completed: 3, total: 8, ratio: 0.375 });
  });

  it('is zero for an empty itinerary', () => {
    expect(progress([])).toEqual({ completed: 0, total: 0, ratio: 0 });
  });
});

describe('costTotals', () => {
  it('adds costs per currency without converting, skipping activities without a cost', () => {
    expect(
      costTotals([
        { estimatedCost: 2550, currency: 'USD' },
        { estimatedCost: 1000, currency: 'EUR' },
        { estimatedCost: null, currency: 'USD' },
        { estimatedCost: 2000, currency: 'USD' },
      ]),
    ).toEqual([
      { currency: 'EUR', minor: 1000 },
      { currency: 'USD', minor: 4550 },
    ]);
  });

  it('is empty when nothing has a cost', () => {
    expect(costTotals([{ estimatedCost: null, currency: 'USD' }])).toEqual([]);
  });
});

describe('dayTimeSpan', () => {
  it('runs from the earliest start to the latest end', () => {
    expect(
      dayTimeSpan([
        { startTime: '10:00', endTime: '12:00' },
        { startTime: '08:30', endTime: '09:00' },
        { startTime: '13:00', endTime: null },
        { startTime: null, endTime: null },
      ]),
    ).toEqual({ start: '08:30', end: '13:00' });
  });

  it('is null when nothing is timed', () => {
    expect(dayTimeSpan([{ startTime: null, endTime: null }])).toBeNull();
    expect(dayTimeSpan([])).toBeNull();
  });
});
