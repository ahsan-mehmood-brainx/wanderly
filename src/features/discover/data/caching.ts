import { MemoryCache } from '@/core/cache/MemoryCache';
import { type AppError } from '@/core/errors/AppError';
import { type Result } from '@/core/result';
import { type Clock } from '@/core/utils/Clock';

import { type Country } from '../domain/Country';
import { type PlaceSearchHit, type PlaceSummary } from '../domain/Destination';
import { type CountryRepository, type PlaceContentRepository } from '../domain/repositories';

// The shared request deliberately ignores callers' signals (see MemoryCache).
const NO_SIGNAL = undefined;

/** Country data changes slowly (population syncs every few hours). */
export const COUNTRY_CACHE_TTL_MS = 60 * 60_000;

/**
 * Caches the country catalogue and per-country details in memory. Search,
 * filters, the home feed and details all read the catalogue, so without this
 * each screen would spend the REST Countries rate limit (20 requests / 10 s) again.
 */
export class CachedCountryRepository implements CountryRepository {
  private readonly catalogue: MemoryCache<readonly Country[]>;
  private readonly details: MemoryCache<Country>;

  constructor(
    private readonly remote: CountryRepository,
    clock: Clock,
    ttlMs: number = COUNTRY_CACHE_TTL_MS,
  ) {
    this.catalogue = new MemoryCache({ ttlMs, maxEntries: 1, clock });
    this.details = new MemoryCache({ ttlMs, maxEntries: 60, clock });
  }

  getAll(signal?: AbortSignal): Promise<Result<readonly Country[], AppError>> {
    return this.catalogue.get('all', () => this.remote.getAll(NO_SIGNAL), signal);
  }

  getByCode(code: string, signal?: AbortSignal): Promise<Result<Country, AppError>> {
    const key = code.trim().toUpperCase();
    return this.details.get(key, () => this.remote.getByCode(key, NO_SIGNAL), signal);
  }
}

export const SUMMARY_CACHE_TTL_MS = 30 * 60_000;

/**
 * Caches Wikipedia summaries (featured cards, recommendations and details ask
 * for the same articles). Search is not cached here: RTK Query caches each
 * search, and a stale title list is worse than a fresh request.
 */
export class CachedPlaceContentRepository implements PlaceContentRepository {
  private readonly summaries: MemoryCache<PlaceSummary | null>;

  constructor(
    private readonly remote: PlaceContentRepository,
    clock: Clock,
    ttlMs: number = SUMMARY_CACHE_TTL_MS,
  ) {
    this.summaries = new MemoryCache({ ttlMs, maxEntries: 150, clock });
  }

  getSummary(title: string, signal?: AbortSignal): Promise<Result<PlaceSummary | null, AppError>> {
    return this.summaries.get(title.trim(), () => this.remote.getSummary(title, NO_SIGNAL), signal);
  }

  searchTitles(
    query: string,
    limit: number,
    signal?: AbortSignal,
  ): Promise<Result<readonly PlaceSearchHit[], AppError>> {
    return this.remote.searchTitles(query, limit, signal);
  }
}
