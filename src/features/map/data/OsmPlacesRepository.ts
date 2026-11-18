import { MemoryCache } from '@/core/cache/MemoryCache';
import { type AppError } from '@/core/errors/AppError';
import { ok, type Result } from '@/core/result';
import { type Clock } from '@/core/utils/Clock';
import { type Coordinates } from '@/features/weather/domain/Coordinates';

import { type LocationSearchResult, type Place } from '../domain/Place';
import { type PlacesRepository } from '../domain/repositories';
import { toLocationSearchResults, toPlaces } from './mappers';
import { type NominatimGeocodingService } from './NominatimGeocodingService';
import { type OverpassPlacesApiService } from './OverpassPlacesApiService';

export const NEARBY_CACHE_TTL_MS = 10 * 60_000;
export const SEARCH_CACHE_TTL_MS = 30 * 60_000;
const MAX_CACHE_ENTRIES = 30;

// The shared request deliberately ignores callers' signals (see MemoryCache).
const NO_SIGNAL = undefined;

/** {@link PlacesRepository} over Nominatim and Overpass, with in-memory caches. */
export class OsmPlacesRepository implements PlacesRepository {
  private readonly nearby: MemoryCache<readonly Place[]>;
  private readonly searches: MemoryCache<readonly LocationSearchResult[]>;

  constructor(
    private readonly geocoding: NominatimGeocodingService,
    private readonly placesApi: OverpassPlacesApiService,
    clock: Clock,
  ) {
    this.nearby = new MemoryCache({ ttlMs: NEARBY_CACHE_TTL_MS, maxEntries: MAX_CACHE_ENTRIES, clock });
    this.searches = new MemoryCache({ ttlMs: SEARCH_CACHE_TTL_MS, maxEntries: MAX_CACHE_ENTRIES, clock });
  }

  searchLocations(
    query: string,
    signal?: AbortSignal,
    language?: string,
  ): Promise<Result<readonly LocationSearchResult[], AppError>> {
    const trimmed = query.trim();
    // Names come back in the requested language, so a language switch must not reuse old hits.
    return this.searches.get(
      `${language ?? ''}|${trimmed.toLowerCase()}`,
      async () => {
        const response = await this.geocoding.search(trimmed, NO_SIGNAL, language);
        return response.ok ? ok(toLocationSearchResults(response.value)) : response;
      },
      signal,
    );
  }

  getNearby(center: Coordinates, signal?: AbortSignal): Promise<Result<readonly Place[], AppError>> {
    return this.nearby.get(
      `${center.latitude.toFixed(3)},${center.longitude.toFixed(3)}`,
      async () => {
        const response = await this.placesApi.fetchNearby(center, NO_SIGNAL);
        return response.ok ? ok(toPlaces(response.value, center)) : response;
      },
      signal,
    );
  }
}
