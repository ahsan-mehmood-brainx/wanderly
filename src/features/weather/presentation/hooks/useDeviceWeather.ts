import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';

import { useDependencies } from '@/core/di/DependenciesProvider';
import { type AppErrorKind } from '@/core/errors/AppError';

import { type Coordinates } from '../../domain/Coordinates';
import { type LocationPermission } from '../../domain/repositories';
import { useDeviceLocationQuery, WEATHER_CACHE_SECONDS, weatherErrorKind } from '../state/weatherApi';
import { useWeather, type WeatherState } from './useWeather';

export type DeviceWeatherState =
  /** Reading the current permission. */
  | { readonly status: 'checking' }
  /** Not asked yet, or refused but askable: explain, then ask on request. */
  | { readonly status: 'needsPermission'; readonly requesting: boolean; readonly request: () => void }
  /** Refused for good: only Settings can change it. */
  | { readonly status: 'blocked'; readonly openSettings: () => Promise<boolean> }
  | { readonly status: 'locating' }
  /** Services off, no fix in time… */
  | { readonly status: 'locationError'; readonly errorKind: AppErrorKind; readonly retry: () => void }
  | { readonly status: 'located'; readonly location: Coordinates; readonly weather: WeatherState };

/**
 * Weather where the device is. The permission prompt is never shown on its own:
 * the UI explains why first and asks when the user taps (`request`). The
 * permission is read again whenever the app returns to the foreground, so
 * turning location on in Settings takes effect on return. With permission
 * granted, the position is read again on return too when it failed or is older
 * than the device-location cache window, so the weather follows the traveller.
 */
export function useDeviceWeather(): DeviceWeatherState {
  const { getLocationPermission, requestLocationPermission, logger, clock } = useDependencies();
  const [permission, setPermission] = useState<LocationPermission | null>(null);
  const [requesting, setRequesting] = useState(false);

  const recheck = useCallback(() => {
    void getLocationPermission.execute().then(setPermission);
  }, [getLocationPermission]);

  useEffect(() => {
    let active = true;
    void getLocationPermission.execute().then((current) => {
      if (active) setPermission(current);
    });
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') recheck();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [getLocationPermission, recheck]);

  const location = useDeviceLocationQuery(undefined, { skip: permission !== 'granted' });
  const coordinates = location.currentData?.coordinates ?? null;
  const weather = useWeather(coordinates);
  const locationError = coordinates ? null : weatherErrorKind(location.error);

  // Back in the foreground: the traveller may have moved, or turned location services back on.
  // The age comes from when the position was read, not from when this screen first saw it.
  const { refetch: refetchLocation, isUninitialized } = location;
  const readAt = location.currentData?.readAt ?? null;
  useEffect(() => {
    if (permission !== 'granted' || isUninitialized) return undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const stale = readAt === null || clock.now() - readAt >= WEATHER_CACHE_SECONDS.deviceLocation * 1000;
      if (stale) void refetchLocation();
    });
    return () => subscription.remove();
  }, [permission, isUninitialized, readAt, clock, refetchLocation]);

  // Permission revoked while the app was running: show the permission state again.
  useEffect(() => {
    if (locationError === 'locationPermissionDenied') recheck();
  }, [locationError, recheck]);

  // A second tap while the system prompt is on its way would ask the OS again; ignore it.
  const requestInFlight = useRef(false);
  const request = useCallback(() => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setRequesting(true);
    void requestLocationPermission
      .execute()
      .then(setPermission)
      .finally(() => {
        requestInFlight.current = false;
        setRequesting(false);
      });
  }, [requestLocationPermission]);

  const openSettings = useCallback(async () => {
    try {
      await Linking.openSettings();
      return true;
    } catch (error) {
      logger.warn('Could not open the system settings', { error });
      return false;
    }
  }, [logger]);

  if (permission === null) return { status: 'checking' };
  if (permission === 'undetermined' || permission === 'denied') {
    return { status: 'needsPermission', requesting, request };
  }
  if (permission === 'blocked') return { status: 'blocked', openSettings };
  if (coordinates) return { status: 'located', location: coordinates, weather };
  if (locationError && !location.isFetching) {
    return { status: 'locationError', errorKind: locationError, retry: () => void location.refetch() };
  }
  return { status: 'locating' };
}
