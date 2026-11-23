import { useCallback } from 'react';

import { useAppDispatch, useAppSelector } from '@/core/store/hooks';
import { useTrips } from '@/features/trips/presentation/hooks/useTrips';

import { selectBudgetTrip } from '../state/budgetSlice';
import { selectBudgetTripId } from '../state/selectors';

/**
 * The trip the Budget tab shows: the one picked in the switcher, else the ongoing
 * trip, then the next upcoming, then the most recently ended. `tripId` is `null`
 * when there are no trips.
 */
export function useBudgetTrip() {
  const dispatch = useAppDispatch();
  const trips = useTrips();
  const tripId = useAppSelector((state) => selectBudgetTripId(state, trips.today));
  const pick = useCallback((id: string) => void dispatch(selectBudgetTrip(id)), [dispatch]);
  return { ...trips, tripId, pick };
}
