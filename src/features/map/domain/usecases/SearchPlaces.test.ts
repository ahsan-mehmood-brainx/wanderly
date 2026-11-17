import { ok } from '@/core/result';
import { type Coordinates } from '@/features/weather/domain/Coordinates';

import { type LocationSearchResult } from '../Place';
import { type PlacesRepository } from '../repositories';
import { SearchPlaces } from './SearchPlaces';

const LOUVRE: LocationSearchResult = {
  id: 'osm:relation/7515426',
  name: 'Louvre Museum',
  subtitle: 'Rue de Rivoli, Paris, France',
  coordinates: { latitude: 48.8611473, longitude: 2.3380277 },
};

function setup() {
  const repository: jest.Mocked<PlacesRepository> = {
    searchLocations: jest.fn<ReturnType<PlacesRepository['searchLocations']>, [string, AbortSignal?]>(async () =>
      ok([LOUVRE]),
    ),
    getNearby: jest.fn<ReturnType<PlacesRepository['getNearby']>, [Coordinates, AbortSignal?]>(async () => ok([])),
  };
  return { repository, searchPlaces: new SearchPlaces(repository) };
}

describe('SearchPlaces', () => {
  it('searches for the trimmed query and passes the signal through', async () => {
    const { repository, searchPlaces } = setup();
    const controller = new AbortController();

    const result = await searchPlaces.execute({ query: '  louvre  ', signal: controller.signal });

    expect(result).toEqual({ ok: true, value: [LOUVRE] });
    expect(repository.searchLocations).toHaveBeenCalledWith('louvre', controller.signal);
  });

  it.each([
    ['empty', ''],
    ['whitespace', '    '],
    ['one character', ' a '],
    ['longer than 200 characters', 'x'.repeat(201)],
  ])('rejects a query that is %s as badRequest, without a request', async (_label, query) => {
    const { repository, searchPlaces } = setup();

    const result = await searchPlaces.execute({ query });

    expect(!result.ok && result.error.kind).toBe('badRequest');
    expect(repository.searchLocations).not.toHaveBeenCalled();
  });

  it('accepts queries of exactly 2 and 200 characters', async () => {
    const { repository, searchPlaces } = setup();

    expect((await searchPlaces.execute({ query: 'ab' })).ok).toBe(true);
    expect((await searchPlaces.execute({ query: 'y'.repeat(200) })).ok).toBe(true);
    expect(repository.searchLocations).toHaveBeenCalledTimes(2);
  });
});
