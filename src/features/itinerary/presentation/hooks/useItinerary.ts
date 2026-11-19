import { useCallback, useEffect, useMemo } from 'react';

import { type AppErrorKind } from '@/core/errors/AppError';
import { useAppDispatch, useAppSelector } from '@/core/store/hooks';
import { addDays, type LocalDate } from '@/features/trips/domain/localDate';
import { useTrip } from '@/features/trips/presentation/hooks/useTrips';

import { dayNumberOf, groupByDay, type ItineraryGroups, isTripDay } from '../../domain/itinerary';
import { loadItinerary } from '../state/itinerarySlice';
import {
  selectActivityById,
  selectDayActivities,
  selectItineraryCostTotals,
  selectItineraryErrorKind,
  selectItineraryLoadStatus,
  selectItineraryProgress,
  selectTripActivities,
  selectTripConflicts,
} from '../state/selectors';

/** What a screen built on the itinerary shows instead of its content. */
export type ItineraryScreenState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly errorKind: AppErrorKind | null }
  | { readonly kind: 'tripNotFound' }
  | { readonly kind: 'ready' };

const EMPTY_GROUPS: ItineraryGroups = { days: [], outsideTrip: [] };

/**
 * View model for a trip's itinerary: the trip (for its dates), its activities by
 * day, progress, cost totals and time conflicts. Loads both once per session.
 */
export function useItinerary(tripId: string) {
  const dispatch = useAppDispatch();
  const tripLoad = useTrip(tripId);
  const { trip } = tripLoad;
  const status = useAppSelector((state) => selectItineraryLoadStatus(state, tripId));
  const loadError = useAppSelector((state) => selectItineraryErrorKind(state, tripId));

  useEffect(() => {
    // Only the first caller loads: the thunk's condition skips it once loading has started.
    if (status === 'idle') void dispatch(loadItinerary(tripId));
  }, [dispatch, status, tripId]);

  const { retry: retryTrips } = tripLoad;
  const retry = useCallback(() => {
    retryTrips();
    void dispatch(loadItinerary(tripId));
  }, [dispatch, retryTrips, tripId]);

  const activities = useAppSelector((state) => selectTripActivities(state, tripId));
  const progress = useAppSelector((state) => selectItineraryProgress(state, tripId));
  const costTotals = useAppSelector((state) => selectItineraryCostTotals(state, tripId));
  const conflicts = useAppSelector((state) => selectTripConflicts(state, tripId));
  const groups = useMemo(() => (trip ? groupByDay(activities, trip) : EMPTY_GROUPS), [activities, trip]);

  const screen: ItineraryScreenState = useMemo(() => {
    if (!trip) {
      if (tripLoad.loading) return { kind: 'loading' };
      if (tripLoad.failed) return { kind: 'failed', errorKind: tripLoad.errorKind };
      return { kind: 'tripNotFound' };
    }
    if (status === 'failed') {
      return loadError === 'notFound' ? { kind: 'tripNotFound' } : { kind: 'failed', errorKind: loadError };
    }
    return status === 'ready' ? { kind: 'ready' } : { kind: 'loading' };
  }, [trip, tripLoad.loading, tripLoad.failed, tripLoad.errorKind, status, loadError]);

  return { screen, trip, today: tripLoad.today, activities, groups, progress, costTotals, conflicts, retry };
}

/** One day of the itinerary. `dayNumber` is `null` for a date outside the trip. */
export function useItineraryDay(tripId: string, date: LocalDate) {
  const itinerary = useItinerary(tripId);
  const { trip } = itinerary;
  const activities = useAppSelector((state) => selectDayActivities(state, tripId, date));
  const dayNumber = trip ? dayNumberOf(trip, date) : null;
  return {
    ...itinerary,
    activities,
    dayNumber,
    insideTrip: trip ? isTripDay(date, trip) : true,
    previousDay: trip && dayNumber !== null && date > trip.startDate ? addDays(date, -1) : null,
    nextDay: trip && dayNumber !== null && date < trip.endDate ? addDays(date, 1) : null,
  };
}

/** One activity of the trip; `activity` is undefined while loading or when it doesn't exist. */
export function useActivity(tripId: string, id: string) {
  const itinerary = useItinerary(tripId);
  const stored = useAppSelector((state) => selectActivityById(state, id));
  // A link may pair an activity with the wrong trip; it only exists within its own.
  const activity = stored?.tripId === tripId ? stored : undefined;
  const dayActivities = useAppSelector((state) => selectDayActivities(state, tripId, activity?.date ?? ''));
  return { ...itinerary, activity, dayActivities };
}
