import { type Clock } from '@/core/utils/Clock';
import { httpFailure } from '@/testing/discoverFixtures';
import { apiSuccess, FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import {
  LOUVRE_RESULT,
  MAP_CENTER,
  overpassResponse,
  PARIS_ELEMENTS,
  stubNominatim,
  stubOverpass,
} from '@/testing/mapFixtures';

import { NominatimGeocodingService } from './NominatimGeocodingService';
import { NOMINATIM_API, NOMINATIM_SEARCH_PATH, OVERPASS_API, OVERPASS_INTERPRETER_PATH } from './osmApis';
import { OsmPlacesRepository } from './OsmPlacesRepository';
import { OverpassPlacesApiService } from './OverpassPlacesApiService';

const fakeTimeClock: Clock = { now: () => Date.now() };
const LOUVRE_CENTER = { latitude: 48.861, longitude: 2.338 };

function setup() {
  const factory = new FakeHttpClientFactory();
  const overpass = stubOverpass(factory);
  const nominatim = stubNominatim(factory);
  const repository = new OsmPlacesRepository(
    new NominatimGeocodingService(factory.create(NOMINATIM_API), fakeTimeClock),
    new OverpassPlacesApiService(factory.create(OVERPASS_API), fakeTimeClock),
    fakeTimeClock,
  );
  return { overpass, nominatim, repository };
}

/** Runs a call that may wait for the request throttle. */
async function settle<T>(promise: Promise<T>): Promise<T> {
  await jest.advanceTimersByTimeAsync(2_000);
  return promise;
}

describe('OsmPlacesRepository', () => {
  beforeEach(() => jest.useFakeTimers({ now: 1_000_000 }));
  afterEach(() => jest.useRealTimers());

  describe('getNearby', () => {
    it('maps the Overpass response into places, nearest first', async () => {
      const { repository } = setup();

      const result = await settle(repository.getNearby(MAP_CENTER));

      if (!result.ok) throw result.error;
      expect(result.value.map((place) => place.id)).toEqual([
        'osm:node/102',
        'osm:node/104',
        'osm:way/103',
        'osm:node/101',
        'osm:node/106',
        'osm:node/105',
      ]);
    });

    it('serves the same centre from cache for 10 minutes, with no request', async () => {
      const { overpass, repository } = setup();

      await settle(repository.getNearby(MAP_CENTER));
      await jest.advanceTimersByTimeAsync(9 * 60_000);
      const cached = await settle(repository.getNearby({ ...MAP_CENTER }));

      expect(cached.ok && cached.value).toHaveLength(6);
      expect(overpass.requests).toHaveLength(1);

      await jest.advanceTimersByTimeAsync(60_000);
      await settle(repository.getNearby(MAP_CENTER));
      expect(overpass.requests).toHaveLength(2);
    });

    it('asks again for a different centre', async () => {
      const { overpass, repository } = setup();

      await settle(repository.getNearby(MAP_CENTER));
      await settle(repository.getNearby(LOUVRE_CENTER));

      expect(overpass.requests).toHaveLength(2);
    });

    it('returns an empty list for an area without places', async () => {
      const { overpass, repository } = setup();
      overpass.on('GET', OVERPASS_INTERPRETER_PATH, apiSuccess(overpassResponse([])));

      expect(await settle(repository.getNearby(MAP_CENTER))).toEqual({ ok: true, value: [] });
    });

    it('does not cache failures, so a retry asks again', async () => {
      const { overpass, repository } = setup();
      overpass.on('GET', OVERPASS_INTERPRETER_PATH, httpFailure('offline'));

      const failed = await settle(repository.getNearby(MAP_CENTER));
      expect(!failed.ok && failed.error.kind).toBe('offline');

      overpass.on('GET', OVERPASS_INTERPRETER_PATH, apiSuccess(overpassResponse(PARIS_ELEMENTS)));
      const retried = await settle(repository.getNearby(MAP_CENTER));
      expect(retried.ok).toBe(true);
      expect(overpass.requests).toHaveLength(2);
    });
  });

  describe('searchLocations', () => {
    it('maps Nominatim hits into search results', async () => {
      const { repository } = setup();

      const result = await settle(repository.searchLocations('Louvre'));

      expect(result).toEqual({
        ok: true,
        value: [
          {
            id: 'osm:relation/7515426',
            name: 'Louvre Museum',
            subtitle: 'Rue de Rivoli, Paris, France',
            coordinates: { latitude: 48.8611473, longitude: 2.3380277 },
          },
        ],
      });
    });

    it('caches by the trimmed, lower-cased query', async () => {
      const { nominatim, repository } = setup();

      await settle(repository.searchLocations('Louvre'));
      await settle(repository.searchLocations('  louvre '));

      expect(nominatim.requests).toHaveLength(1);
    });

    it('returns an empty list when nothing matches', async () => {
      const { nominatim, repository } = setup();
      nominatim.on('GET', NOMINATIM_SEARCH_PATH, apiSuccess([]));

      expect(await settle(repository.searchLocations('zzqx'))).toEqual({ ok: true, value: [] });
    });

    it('passes failures through with their kind', async () => {
      const { nominatim, repository } = setup();
      nominatim.on('GET', NOMINATIM_SEARCH_PATH, httpFailure('timeout'));

      const result = await settle(repository.searchLocations('Louvre'));

      expect(!result.ok && result.error.kind).toBe('timeout');
      nominatim.on('GET', NOMINATIM_SEARCH_PATH, apiSuccess([LOUVRE_RESULT]));
      expect((await settle(repository.searchLocations('Louvre'))).ok).toBe(true);
    });
  });
});
