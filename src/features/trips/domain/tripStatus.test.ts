import { storedTrip } from '@/testing/tripFixtures';

import { compareTripsForStatus, deriveTripStatus, tripLengthDays, tripTimeline, withStatus } from './tripStatus';

const trip = storedTrip({ startDate: '2027-07-01', endDate: '2027-07-05' });

describe('deriveTripStatus', () => {
  it.each([
    ['2027-06-30', 'upcoming'],
    ['2027-07-01', 'ongoing'],
    ['2027-07-03', 'ongoing'],
    ['2027-07-05', 'ongoing'],
    ['2027-07-06', 'completed'],
  ])('on %s the trip is %s', (today, status) => expect(deriveTripStatus(trip, today)).toBe(status));

  it('treats a one-day trip as ongoing only on that day', () => {
    const dayTrip = storedTrip({ startDate: '2027-07-01', endDate: '2027-07-01' });
    expect(deriveTripStatus(dayTrip, '2027-06-30')).toBe('upcoming');
    expect(deriveTripStatus(dayTrip, '2027-07-01')).toBe('ongoing');
    expect(deriveTripStatus(dayTrip, '2027-07-02')).toBe('completed');
  });

  it.each(['2027-06-01', '2027-07-03', '2027-08-01'])('cancelled wins on %s', (today) => {
    expect(deriveTripStatus({ ...trip, cancelledAt: 1 }, today)).toBe('cancelled');
  });
});

describe('withStatus', () => {
  it('adds the status', () => expect(withStatus(trip, '2027-07-02').status).toBe('ongoing'));

  it('keeps the same object when nothing changed, and a new one when the day moves it on', () => {
    const current = withStatus(trip, '2027-07-02');
    expect(withStatus(current, '2027-07-03')).toBe(current);
    expect(withStatus(current, '2027-07-06')).toEqual({ ...current, status: 'completed' });
  });
});

describe('tripLengthDays', () => {
  it('counts both the first and last day', () => {
    expect(tripLengthDays(trip)).toBe(5);
    expect(tripLengthDays({ startDate: '2027-07-01', endDate: '2027-07-01' })).toBe(1);
    expect(tripLengthDays({ startDate: '2027-12-31', endDate: '2028-01-01' })).toBe(2);
  });
});

describe('tripTimeline', () => {
  it('counts down, counts days during the trip, and counts up afterwards', () => {
    expect(tripTimeline(trip, '2027-06-28')).toEqual({ kind: 'startsIn', days: 3 });
    expect(tripTimeline(trip, '2027-07-01')).toEqual({ kind: 'inProgress', day: 1, of: 5 });
    expect(tripTimeline(trip, '2027-07-05')).toEqual({ kind: 'inProgress', day: 5, of: 5 });
    expect(tripTimeline(trip, '2027-07-07')).toEqual({ kind: 'endedAgo', days: 2 });
    expect(tripTimeline({ ...trip, cancelledAt: 1 }, '2027-07-01')).toEqual({ kind: 'cancelled' });
  });
});

describe('compareTripsForStatus', () => {
  const early = storedTrip({ id: 'early', startDate: '2027-01-01', endDate: '2027-01-03' });
  const late = storedTrip({ id: 'late', startDate: '2027-03-01', endDate: '2027-03-03' });
  const order = (status: Parameters<typeof compareTripsForStatus>[0]) =>
    [late, early].sort(compareTripsForStatus(status)).map(({ id }) => id);

  it('puts the soonest first while trips are ahead', () => {
    expect(order('upcoming')).toEqual(['early', 'late']);
    expect(order('ongoing')).toEqual(['early', 'late']);
  });

  it('puts the most recent first once they are over', () => {
    expect(order('completed')).toEqual(['late', 'early']);
    expect(order('cancelled')).toEqual(['late', 'early']);
  });
});
