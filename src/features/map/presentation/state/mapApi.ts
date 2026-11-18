import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';

import { type AppDependencies } from '@/core/di/AppDependencies';
import { type AppError, type AppErrorKind } from '@/core/errors/AppError';
import { type Result } from '@/core/result';
import { type Coordinates } from '@/features/weather/domain/Coordinates';

import { type LocationSearchResult, type Place } from '../../domain/Place';

/** Serialisable error stored in the RTK Query cache; the UI renders it by kind. */
export interface MapQueryError {
  readonly kind: AppErrorKind;
}

type QueryResult<T> = { data: T } | { error: MapQueryError };

const fromResult = <T>(result: Result<T, AppError>): QueryResult<T> =>
  result.ok ? { data: result.value } : { error: { kind: result.error.kind } };

export interface LocationSearchArgs {
  readonly query: string;
  /** The app language the results are shown in. */
  readonly language: string;
}

/** The thunk extra argument is the DI container (see `createAppStore`). */
const dependencies = (extra: unknown) => extra as AppDependencies;

/** A device position and when it was read, by the injected clock. */
export interface MapDevicePosition {
  readonly coordinates: Coordinates;
  /** Epoch ms of the read, so its age holds even for a screen that mounts onto the cached copy. */
  readonly readAt: number;
}

/** Seconds a result stays cached after the map screen goes away. */
export const MAP_CACHE_SECONDS = {
  /**
   * Map → details → back reuses the position; a walk across town does not. Also how old a
   * position may be before returning to the foreground or "My location" reads it again.
   */
  currentLocation: 2 * 60,
  /** Matches the repository's 10-minute nearby cache. */
  nearbyPlaces: 10 * 60,
  searchLocations: 5 * 60,
} as const;

/**
 * RTK Query layer for the explore map. Endpoints call use cases through
 * `queryFn`; validation, rate limits and the in-memory caches stay in the
 * domain and data layers. Filters are applied on the client, so toggling a
 * category never sends a request.
 */
export const mapApi = createApi({
  reducerPath: 'mapApi',
  baseQuery: fakeBaseQuery<MapQueryError>(),
  endpoints: (build) => ({
    currentLocation: build.query<MapDevicePosition, void>({
      queryFn: async (_arg, api) => {
        const { getCurrentLocation, clock } = dependencies(api.extra);
        const result = await getCurrentLocation.execute({ signal: api.signal });
        return result.ok
          ? { data: { coordinates: result.value, readAt: clock.now() } }
          : fromResult<MapDevicePosition>(result);
      },
      keepUnusedDataFor: MAP_CACHE_SECONDS.currentLocation,
    }),
    nearbyPlaces: build.query<readonly Place[], Coordinates>({
      queryFn: async (center, api) =>
        fromResult(await dependencies(api.extra).getNearbyPlaces.execute({ center, signal: api.signal })),
      keepUnusedDataFor: MAP_CACHE_SECONDS.nearbyPlaces,
    }),
    // The language is part of the cache key: names are localised, so switching language searches again.
    searchLocations: build.query<readonly LocationSearchResult[], LocationSearchArgs>({
      queryFn: async ({ query, language }, api) =>
        fromResult(await dependencies(api.extra).searchPlaces.execute({ query, language, signal: api.signal })),
      keepUnusedDataFor: MAP_CACHE_SECONDS.searchLocations,
    }),
  }),
});

export const { useCurrentLocationQuery, useNearbyPlacesQuery, useSearchLocationsQuery } = mapApi;

/** Narrows RTK Query's loosely typed `error` to an error kind, if any. */
export function mapErrorKind(error: unknown): AppErrorKind | null {
  if (error && typeof error === 'object' && 'kind' in error && typeof error.kind === 'string') {
    return error.kind as AppErrorKind;
  }
  return error ? 'unknown' : null;
}
