import { skipToken } from '@reduxjs/toolkit/query';
import { useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';

import { useDependencies } from '@/core/di/DependenciesProvider';
import { type AppErrorKind } from '@/core/errors/AppError';
import { isConnectivityError } from '@/core/errors/errorMessages';
import { useConnectivity } from '@/shared/hooks/useConnectivity';

import { type Coordinates, validateCoordinates } from '../../domain/Coordinates';
import { DEFAULT_WEATHER_CACHE_POLICY } from '../../domain/usecases/GetWeatherForecast';
import { type WeatherReport } from '../../domain/Weather';
import { summarizeForecast, type WeatherSummary } from '../../domain/weatherCalculations';
import { useForecastQuery, weatherErrorKind } from '../state/weatherApi';
import { useNow } from './useNow';

export type WeatherState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'error';
      readonly errorKind: AppErrorKind;
      /** `null` when trying again can't help (no or invalid coordinates). */
      readonly retry: (() => void) | null;
    }
  | {
      readonly status: 'ready';
      readonly report: WeatherReport;
      readonly summary: WeatherSummary;
      /** The instant `summary` was derived for; views label "Now" and "Today" against it. */
      readonly now: number;
      /** A refresh is running while the current forecast stays on screen. */
      readonly refreshing: boolean;
      /** Downloads a new forecast, skipping the saved copy. */
      readonly refresh: () => void;
    };

/** Problems with the position itself: no request is made, and retrying can't help. */
const PERMANENT_KINDS: ReadonlySet<AppErrorKind> = new Set(['invalidLocation', 'locationUnavailable']);

/**
 * Weather for a position, ready to render.
 *
 * - Missing or invalid coordinates become an error state without a request.
 * - Coordinates are rounded before they become the RTK Query key, so the
 *   destination card and the forecast screen share one cached forecast.
 * - A saved forecast shown because the network failed is refreshed
 *   automatically when the device comes back online.
 * - "Now", the next 24 hours and the coming days are derived from the injected
 *   clock, in the forecast location's time zone, and move on as time passes
 *   (see `useNow`): a screen left open overnight shows today, not yesterday.
 * - Back in the foreground with a forecast older than the use case's fresh
 *   window, a new one is downloaded.
 */
export function useWeather(location: Partial<Coordinates> | null | undefined): WeatherState {
  const { clock } = useDependencies();
  const latitude = location?.latitude;
  const longitude = location?.longitude;
  const missing = location === null || location === undefined;

  const valid = useMemo(
    () => validateCoordinates(missing ? null : { latitude, longitude }),
    [missing, latitude, longitude],
  );
  const query = useForecastQuery(valid.ok ? valid.value : skipToken);
  const report = query.currentData;
  const queryError = report ? null : weatherErrorKind(query.error);
  const { refetch } = query;
  const now = useNow(clock);

  // Back in the foreground after a while: the forecast on screen may be hours old.
  const fetchedAt = report?.forecast.fetchedAt;
  useEffect(() => {
    if (fetchedAt === undefined) return undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && clock.now() - fetchedAt >= DEFAULT_WEATHER_CACHE_POLICY.freshForMs) void refetch();
    });
    return () => subscription.remove();
  }, [fetchedAt, clock, refetch]);

  // Back online after showing a saved forecast (or a connectivity error): fetch a live one.
  const { isOffline } = useConnectivity();
  const wasOffline = useRef(isOffline);
  const needsLiveData = report?.fallbackReason != null || (queryError !== null && isConnectivityError(queryError));
  useEffect(() => {
    const reconnected = wasOffline.current && !isOffline;
    wasOffline.current = isOffline;
    if (reconnected && valid.ok && needsLiveData) void refetch();
  }, [isOffline, needsLiveData, refetch, valid.ok]);

  return useMemo((): WeatherState => {
    if (!valid.ok) return { status: 'error', errorKind: valid.error.kind, retry: null };
    if (report) {
      return {
        status: 'ready',
        report,
        summary: summarizeForecast(report.forecast, now),
        now,
        refreshing: query.isFetching,
        refresh: () => void refetch(),
      };
    }
    if (queryError && !query.isFetching) {
      return {
        status: 'error',
        errorKind: queryError,
        retry: PERMANENT_KINDS.has(queryError) ? null : () => void refetch(),
      };
    }
    return { status: 'loading' };
  }, [valid, report, queryError, query.isFetching, refetch, now]);
}
