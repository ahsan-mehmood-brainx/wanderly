import { AppError, toAppError } from '@/core/errors/AppError';
import { err, type Result } from '@/core/result';
import { type Clock } from '@/core/utils/Clock';

import { type Country } from '../domain/Country';
import { type PlaceSearchHit, type PlaceSummary } from '../domain/Destination';
import { type CountryRepository, type PlaceContentRepository } from '../domain/repositories';

export interface MemoryCacheOptions {
  readonly ttlMs: number;
  /** Oldest entries are evicted beyond this. */
  readonly maxEntries: number;
  readonly clock: Clock;
}

/**
 * Small TTL + LRU cache for `Result`-returning loads, with request coalescing.
 *
 * - Only successes are cached, so a failure (offline, rate limited) is retried next time.
 * - Concurrent loads of the same key share one request. The shared request is not
 *   tied to any caller's `AbortSignal`: if one caller cancels, it gets `cancelled`
 *   while the request completes for the others and fills the cache.
 */
export class MemoryCache<T> {
  private readonly entries = new Map<string, { readonly value: T; readonly expiresAt: number }>();
  private readonly inFlight = new Map<string, Promise<Result<T, AppError>>>();

  constructor(private readonly options: MemoryCacheOptions) {}

  async get(key: string, load: () => Promise<Result<T, AppError>>, signal?: AbortSignal): Promise<Result<T, AppError>> {
    if (signal?.aborted) return err(cancelled());

    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > this.options.clock.now()) {
      // Refresh recency for LRU eviction.
      this.entries.delete(key);
      this.entries.set(key, cached);
      return { ok: true, value: cached.value };
    }
    if (cached) this.entries.delete(key);

    let pending = this.inFlight.get(key);
    if (!pending) {
      pending = load().then(
        (result) => {
          this.inFlight.delete(key);
          if (result.ok) this.store(key, result.value);
          return result;
        },
        // Loaders return Results by contract; a throw must still not leave a stuck in-flight entry.
        (cause: unknown) => {
          this.inFlight.delete(key);
          return err(toAppError(cause));
        },
      );
      this.inFlight.set(key, pending);
    }
    return signal ? raceAbort(pending, signal) : pending;
  }

  clear(): void {
    this.entries.clear();
  }

  private store(key: string, value: T): void {
    this.entries.set(key, { value, expiresAt: this.options.clock.now() + this.options.ttlMs });
    while (this.entries.size > this.options.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}

const cancelled = () => new AppError('cancelled', 'Request was cancelled');

function raceAbort<T>(promise: Promise<Result<T, AppError>>, signal: AbortSignal): Promise<Result<T, AppError>> {
  if (signal.aborted) return Promise.resolve(err(cancelled()));
  return new Promise((resolve) => {
    const onAbort = () => resolve(err(cancelled()));
    signal.addEventListener('abort', onAbort, { once: true });
    void promise.then((result) => {
      signal.removeEventListener('abort', onAbort);
      resolve(result);
    });
  });
}

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
