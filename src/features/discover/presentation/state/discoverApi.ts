import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';

import { type AppDependencies } from '@/core/di/AppDependencies';
import { type AppError, type AppErrorKind } from '@/core/errors/AppError';
import { type Result } from '@/core/result';

import { type DestinationDetails, type DestinationSummary, type RecentDestination } from '../../domain/Destination';
import { type FilterOptions, type SearchFilters } from '../../domain/SearchFilters';
import { type CuratedCollection, type Recommendation } from '../../domain/usecases/discoverFeed';
import { type SearchOutcome } from '../../domain/usecases/SearchDestinations';

/** Serialisable error stored in the RTK Query cache; the UI renders it with `<AppErrorView errorKind>`. */
export interface DiscoverQueryError {
  readonly kind: AppErrorKind;
}

export interface SearchArgs {
  readonly query: string;
  readonly filters: SearchFilters;
}

type QueryResult<T> = { data: T } | { error: DiscoverQueryError };

const fromResult = <T>(result: Result<T, AppError>): QueryResult<T> =>
  result.ok ? { data: result.value } : { error: { kind: result.error.kind } };

/** The thunk extra argument is the DI container (see `createAppStore`). */
const dependencies = (extra: unknown) => extra as AppDependencies;

/** Seconds a result stays cached after the last screen using it goes away. */
export const CACHE_SECONDS = {
  search: 120,
  /** Destination details: revisiting a destination (back/forward, recents) is instant. */
  details: 30 * 60,
  feed: 30 * 60,
} as const;

/**
 * RTK Query layer for discovery. There is no `baseQuery`: each endpoint calls a
 * use case through `queryFn`, so HTTP, validation, error mapping and repository
 * caching stay in the data layer, and RTK Query adds what the UI needs on top:
 * a per-argument cache, request de-duplication, loading flags, refetching and
 * out-of-order protection (a slow search for "lis" can't overwrite "lisbon").
 */
export const discoverApi = createApi({
  reducerPath: 'discoverApi',
  baseQuery: fakeBaseQuery<DiscoverQueryError>(),
  endpoints: (build) => ({
    searchDestinations: build.query<SearchOutcome, SearchArgs>({
      queryFn: async (args, api) =>
        fromResult(await dependencies(api.extra).searchDestinations.execute({ ...args, signal: api.signal })),
      keepUnusedDataFor: CACHE_SECONDS.search,
    }),
    destinationDetails: build.query<DestinationDetails, string>({
      queryFn: async (id, api) =>
        fromResult(await dependencies(api.extra).getDestinationDetails.execute({ id, signal: api.signal })),
      keepUnusedDataFor: CACHE_SECONDS.details,
    }),
    curatedCollection: build.query<DestinationSummary[], CuratedCollection>({
      queryFn: async (collection, api) =>
        fromResult(await dependencies(api.extra).getCuratedCollection.execute({ collection, signal: api.signal })),
      keepUnusedDataFor: CACHE_SECONDS.feed,
    }),
    popularCountries: build.query<DestinationSummary[], void>({
      queryFn: async (_arg, api) =>
        fromResult(await dependencies(api.extra).getPopularCountries.execute({ signal: api.signal })),
      keepUnusedDataFor: CACHE_SECONDS.feed,
    }),
    filterOptions: build.query<FilterOptions, void>({
      queryFn: async (_arg, api) =>
        fromResult(await dependencies(api.extra).getFilterOptions.execute({ signal: api.signal })),
      keepUnusedDataFor: CACHE_SECONDS.feed,
    }),
    recommendations: build.query<Recommendation[], readonly RecentDestination[]>({
      queryFn: async (recentlyViewed, api) =>
        fromResult(await dependencies(api.extra).getRecommendations.execute({ recentlyViewed, signal: api.signal })),
      keepUnusedDataFor: CACHE_SECONDS.feed,
    }),
  }),
});

export const {
  useSearchDestinationsQuery,
  useDestinationDetailsQuery,
  useCuratedCollectionQuery,
  usePopularCountriesQuery,
  useRecommendationsQuery,
  useFilterOptionsQuery,
} = discoverApi;

/** Narrows RTK Query's `error` (typed loosely by the hooks) to the error kind, if any. */
export function queryErrorKind(error: unknown): AppErrorKind | null {
  if (error && typeof error === 'object' && 'kind' in error && typeof error.kind === 'string') {
    return error.kind as AppErrorKind;
  }
  return error ? 'unknown' : null;
}
