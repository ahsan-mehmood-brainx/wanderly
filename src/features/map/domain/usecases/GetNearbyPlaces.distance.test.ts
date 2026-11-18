import { ok } from '@/core/result';

import { distanceMeters } from '../geo';
import { type Place } from '../Place';
import { type PlacesRepository } from '../repositories';
import { GetNearbyPlaces } from './GetNearbyPlaces';

const ROUNDED = { latitude: 48.858, longitude: 2.294 };
// ~55 m north-east of the rounded centre.
const EXACT = { latitude: 48.8584, longitude: 2.2945 };

const place = (id: string, latitude: number, longitude: number): Place => ({
  id,
  name: id,
  category: 'restaurants',
  coordinates: { latitude, longitude },
  distanceMeters: distanceMeters(ROUNDED, { latitude, longitude }),
  address: null,
  openingHours: null,
  website: null,
  phone: null,
});

describe('GetNearbyPlaces distances', () => {
  it('measures distances from the exact centre, not the rounded one sent to the server, nearest first', async () => {
    // Nearest to the rounded centre, but further from the exact one than `ahead`.
    const behind = place('behind', 48.8578, 2.2938);
    const ahead = place('ahead', 48.8588, 2.2952);
    const cached = [behind, ahead];
    const repository: PlacesRepository = {
      searchLocations: async () => ok([]),
      getNearby: async () => ok(cached),
    };

    const result = await new GetNearbyPlaces(repository).execute({ center: EXACT });

    expect(behind.distanceMeters).toBeLessThan(ahead.distanceMeters);
    if (!result.ok) throw new Error('expected places');
    expect(result.value.map((p) => p.id)).toEqual(['ahead', 'behind']);
    expect(result.value[0]?.distanceMeters).toBeCloseTo(distanceMeters(EXACT, ahead.coordinates), 6);
    expect(result.value[1]?.distanceMeters).toBeCloseTo(distanceMeters(EXACT, behind.coordinates), 6);
    // The repository's (cached) places are not changed.
    expect(cached.map((p) => p.id)).toEqual(['behind', 'ahead']);
    expect(behind.distanceMeters).toBeCloseTo(distanceMeters(ROUNDED, behind.coordinates), 6);
  });
});
