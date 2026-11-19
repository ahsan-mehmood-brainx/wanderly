import { useCallback, useEffect, useMemo } from 'react';

import { useAppDispatch, useAppSelector } from '@/core/store/hooks';

import { withStatus } from '../../domain/tripStatus';
import {
  selectStoredTripById,
  selectTripCount,
  selectTripGroups,
  selectTripsErrorKind,
  selectTripsLoadStatus,
} from '../state/selectors';
import { loadTrips } from '../state/tripsSlice';
import { useToday } from './useToday';

function useTripsLoad() {
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectTripsLoadStatus);
  const errorKind = useAppSelector(selectTripsErrorKind);
  useEffect(() => {
    // Only the first caller loads: the thunk's condition skips it once loading has started.
    if (status === 'idle') void dispatch(loadTrips());
  }, [dispatch, status]);
  const retry = useCallback(() => void dispatch(loadTrips()), [dispatch]);
  return { loading: status === 'idle' || status === 'loading', failed: status === 'failed', errorKind, retry };
}

/** View model for the trip lists. */
export function useTrips() {
  const load = useTripsLoad();
  const today = useToday();
  const groups = useAppSelector((state) => selectTripGroups(state, today));
  const total = useAppSelector(selectTripCount);
  return { ...load, today, groups, total };
}

/** One trip with its status as of today; `trip` is undefined while loading or when it doesn't exist. */
export function useTrip(id: string) {
  const load = useTripsLoad();
  const today = useToday();
  const stored = useAppSelector((state) => selectStoredTripById(state, id));
  const trip = useMemo(() => (stored ? withStatus(stored, today) : undefined), [stored, today]);
  return { ...load, today, trip };
}
