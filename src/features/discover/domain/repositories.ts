import { type AppError } from '@/core/errors/AppError';
import { type Result } from '@/core/result';

import { type Country } from './Country';
import { type PlaceSearchHit, type PlaceSummary, type RecentDestination } from './Destination';

/** Country data (REST Countries). Implementations map every transport failure into the AppError taxonomy. */
export interface CountryRepository {
  /** Every country, with the fields search, filters and cards need. */
  getAll(signal?: AbortSignal): Promise<Result<readonly Country[], AppError>>;
  /** One country with every field. Fails with `notFound` for an unknown code. */
  getByCode(code: string, signal?: AbortSignal): Promise<Result<Country, AppError>>;
}

/** Descriptions, photos and place search (Wikipedia). */
export interface PlaceContentRepository {
  /**
   * The article summary, or `null` when there is no usable article: missing, or a
   * disambiguation page (which describes several places, not this one).
   */
  getSummary(title: string, signal?: AbortSignal): Promise<Result<PlaceSummary | null, AppError>>;
  /** Article titles matching the query, most relevant first. Not limited to places. */
  searchTitles(
    query: string,
    limit: number,
    signal?: AbortSignal,
  ): Promise<Result<readonly PlaceSearchHit[], AppError>>;
}

/** On-device discovery history. Reads never fail: unreadable data is treated as empty. */
export interface DiscoveryHistoryRepository {
  /** Most recent first. */
  loadSearchHistory(): Promise<readonly string[]>;
  saveSearchHistory(queries: readonly string[]): Promise<Result<void, AppError>>;
  /** Most recent first. */
  loadRecentlyViewed(): Promise<readonly RecentDestination[]>;
  saveRecentlyViewed(destinations: readonly RecentDestination[]): Promise<Result<void, AppError>>;
}
