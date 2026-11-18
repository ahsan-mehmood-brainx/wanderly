import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';

import { type AppDependencies } from '@/core/di/AppDependencies';
import { type AppError, type AppErrorKind } from '@/core/errors/AppError';
import { type Result } from '@/core/result';

import { type Coordinates } from '../../domain/Coordinates';
import { type WeatherReport } from '../../domain/Weather';

/** Serialisable error stored in the RTK Query cache; the UI renders it by kind. */
export interface WeatherQueryError {
  readonly kind: AppErrorKind;
}

type QueryResult<T> = { data: T } | { error: WeatherQueryError };

const fromResult = <T>(result: Result<T, AppError>): QueryResult<T> =>
  result.ok ? { data: result.value } : { error: { kind: result.error.kind } };

/** The thunk extra argument is the DI container (see `createAppStore`). */
const dependencies = (extra: unknown) => extra as AppDependencies;

/** Seconds a result stays cached after the last screen using it goes away. */
export const WEATHER_CACHE_SECONDS = {
  /** Destination card → full forecast → back is instant; matches the use case's freshness window. */
  forecast: 15 * 60,
  /** A position is reused briefly (card → forecast screen) but not across a long walk. */
  deviceLocation: 2 * 60,
} as const;

/**
 * RTK Query layer for weather. As in `discoverApi`, endpoints call use cases
 * through `queryFn`, so HTTP, validation and the on-device cache stay in the
 * data and domain layers. RTK Query adds the per-coordinates in-memory cache,
 * de-duplication (the destination card and the forecast screen share one
 * request) and loading flags.
 *
 * Arguments are rounded coordinates (see `useWeather`), so nearby requests share
 * a cache entry. `refetch()` sets `forced`, which skips the saved copy: pull to
 * refresh and "try again" always ask the network.
 */
export const weatherApi = createApi({
  reducerPath: 'weatherApi',
  baseQuery: fakeBaseQuery<WeatherQueryError>(),
  endpoints: (build) => ({
    forecast: build.query<WeatherReport, Coordinates>({
      queryFn: async (location, api) =>
        fromResult(
          await dependencies(api.extra).getWeatherForecast.execute({
            location,
            forceRefresh: api.forced === true,
            signal: api.signal,
          }),
        ),
      keepUnusedDataFor: WEATHER_CACHE_SECONDS.forecast,
    }),
    deviceLocation: build.query<Coordinates, void>({
      queryFn: async (_arg, api) =>
        fromResult(await dependencies(api.extra).getDeviceLocation.execute({ signal: api.signal })),
      keepUnusedDataFor: WEATHER_CACHE_SECONDS.deviceLocation,
    }),
  }),
});

export const { useForecastQuery, useDeviceLocationQuery } = weatherApi;

/** Narrows RTK Query's loosely typed `error` to an error kind, if any. */
export function weatherErrorKind(error: unknown): AppErrorKind | null {
  if (error && typeof error === 'object' && 'kind' in error && typeof error.kind === 'string') {
    return error.kind as AppErrorKind;
  }
  return error ? 'unknown' : null;
}
