import { skipToken } from '@reduxjs/toolkit/query/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';

import { useDependencies } from '@/core/di/DependenciesProvider';
import { type AppErrorKind } from '@/core/errors/AppError';
import { type Coordinates } from '@/features/weather/domain/Coordinates';
import { type LocationPermission } from '@/features/weather/domain/repositories';

import { MAP_CACHE_SECONDS, mapErrorKind, useCurrentLocationQuery } from '../state/mapApi';

export type MapLocationState =
  /** Reading the current permission. */
  | { readonly status: 'checking' }
  /** Not asked yet, or refused but askable: explain, then ask on request. */
  | { readonly status: 'needsPermission'; readonly requesting: boolean; readonly request: () => void }
  /** Refused for good: only Settings can change it. */
  | { readonly status: 'blocked'; readonly openSettings: () => Promise<boolean> }
  | { readonly status: 'locating' }
  /** Services off, no fix in time, an impossible fix. */
  | { readonly status: 'locationError'; readonly errorKind: AppErrorKind; readonly retry: () => void }
  | {
      readonly status: 'located';
      readonly location: Coordinates;
      /** Reads the position again if it is older than the position cache window; otherwise does nothing. */
      readonly refreshIfStale: () => void;
    };

const POSITION_FRESH_MS = MAP_CACHE_SECONDS.currentLocation * 1000;

/**
 * The device's position for the map. As on the weather card, the permission
 * prompt is never shown on its own: the UI explains first and asks on `request`.
 * The permission is read again whenever the app returns to the foreground. With
 * permission granted, the position is read again on return too when it failed
 * (location services may have been turned on) or is older than the position
 * cache window, so a map left open follows the traveller.
 */
export function useMapLocation(): MapLocationState {
  const { checkMapLocationPermission, requestMapLocationPermission, logger, clock } = useDependencies();
  const [permission, setPermission] = useState<LocationPermission | null>(null);
  const [requesting, setRequesting] = useState(false);

  const recheck = useCallback(() => {
    void checkMapLocationPermission.execute().then(setPermission);
  }, [checkMapLocationPermission]);

  useEffect(() => {
    let active = true;
    void checkMapLocationPermission.execute().then((current) => {
      if (active) setPermission(current);
    });
    return () => {
      active = false;
    };
  }, [checkMapLocationPermission]);

  const location = useCurrentLocationQuery(permission === 'granted' ? undefined : skipToken);
  const coordinates = location.currentData?.coordinates ?? null;
  const errorKind = coordinates ? null : mapErrorKind(location.error);

  // The age comes from when the position was read, not from when this screen first saw it.
  // A refetch while a read is already on its way is dropped by RTK Query, so this never asks twice.
  const { refetch, isUninitialized } = location;
  const readAt = location.currentData?.readAt ?? null;
  const refreshIfStale = useCallback(() => {
    if (permission !== 'granted' || isUninitialized) return;
    if (readAt === null || clock.now() - readAt >= POSITION_FRESH_MS) void refetch();
  }, [permission, isUninitialized, readAt, clock, refetch]);

  // Back in the foreground: the traveller may have moved, or turned location services back on.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      recheck();
      refreshIfStale();
    });
    return () => subscription.remove();
  }, [recheck, refreshIfStale]);

  // Permission revoked while the app was running: show the permission state again.
  useEffect(() => {
    if (errorKind === 'locationPermissionDenied') recheck();
  }, [errorKind, recheck]);

  // A second tap while the system prompt is on its way would ask the OS again; ignore it.
  const requestInFlight = useRef(false);
  const request = useCallback(() => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setRequesting(true);
    void requestMapLocationPermission
      .execute()
      .then(setPermission)
      .finally(() => {
        requestInFlight.current = false;
        setRequesting(false);
      });
  }, [requestMapLocationPermission]);

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
  if (coordinates) return { status: 'located', location: coordinates, refreshIfStale };
  if (errorKind && errorKind !== 'locationPermissionDenied' && !location.isFetching) {
    return { status: 'locationError', errorKind, retry: () => void refetch() };
  }
  return { status: 'locating' };
}
