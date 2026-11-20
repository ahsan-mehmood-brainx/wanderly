import { storedTrip, TRIPS_TODAY } from '@/testing/tripFixtures';

import { summarizeTravelStats } from './travelStats';

describe('summarizeTravelStats', () => {
  it('TC-08 counts every trip except cancelled ones, completed trips as of today, and every saved place', () => {
    const trips = [
      storedTrip({ id: 'past', startDate: '2027-01-01', endDate: '2027-01-05' }),
      storedTrip({ id: 'older', startDate: '2026-03-01', endDate: '2026-03-02' }),
      storedTrip({ id: 'now', startDate: '2027-06-10', endDate: '2027-06-20' }),
      storedTrip({ id: 'next', startDate: '2027-07-01', endDate: '2027-07-02' }),
      storedTrip({ id: 'off', startDate: '2026-08-01', endDate: '2026-08-02', cancelledAt: 1 }),
    ];

    expect(summarizeTravelStats(trips, 7, TRIPS_TODAY)).toEqual({
      totalTrips: 4,
      completedTrips: 2,
      savedPlaces: 7,
    });
  });

  it('TC-08 counts a trip ending today as not yet completed', () => {
    const trips = [storedTrip({ startDate: '2027-06-10', endDate: TRIPS_TODAY })];

    expect(summarizeTravelStats(trips, 0, TRIPS_TODAY).completedTrips).toBe(0);
    expect(summarizeTravelStats(trips, 0, '2027-06-16').completedTrips).toBe(1);
  });

  it('TC-08 is all zeros with no trips and no favorites', () => {
    expect(summarizeTravelStats([], 0, TRIPS_TODAY)).toEqual({ totalTrips: 0, completedTrips: 0, savedPlaces: 0 });
  });
});
