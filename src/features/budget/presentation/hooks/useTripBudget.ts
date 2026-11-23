import { useCallback, useEffect, useMemo } from 'react';

import { type AppErrorKind } from '@/core/errors/AppError';
import { useAppDispatch, useAppSelector } from '@/core/store/hooks';
import { useTrip } from '@/features/trips/presentation/hooks/useTrips';

import { loadTripExpenses, retryConversions } from '../state/budgetSlice';
import {
  selectBudgetConverted,
  selectBudgetErrorKind,
  selectBudgetLoadStatus,
  selectBudgetRunning,
  selectBudgetSummary,
  selectTripExpenses,
} from '../state/selectors';

/** What a screen built on a trip's budget shows instead of its content. */
export type BudgetScreenState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly errorKind: AppErrorKind | null }
  | { readonly kind: 'tripNotFound' }
  | { readonly kind: 'ready' };

interface TripBudgetOptions {
  /**
   * Convert expenses that aren't in the trip's currency yet (may call the
   * exchange-rate API). Screens that show totals do; screens that only list or
   * show expenses read what is stored and never wait on the network.
   */
  readonly convert?: boolean;
}

/**
 * View model for a trip's budget: the trip (budget, currency and dates), its
 * expenses newest first and the totals. Loads both once per session.
 */
export function useTripBudget(tripId: string, { convert = true }: TripBudgetOptions = {}) {
  const dispatch = useAppDispatch();
  const tripLoad = useTrip(tripId);
  const { trip } = tripLoad;
  const status = useAppSelector((state) => selectBudgetLoadStatus(state, tripId));
  const loadError = useAppSelector((state) => selectBudgetErrorKind(state, tripId));
  const converted = useAppSelector((state) => selectBudgetConverted(state, tripId));
  const running = useAppSelector((state) => selectBudgetRunning(state, tripId));

  useEffect(() => {
    // Only the first caller loads or converts: the thunks' conditions skip a run while one is going.
    // The stored expenses come first so the screen never waits on the exchange-rate API.
    if (status === 'idle') void dispatch(loadTripExpenses(tripId));
    // Expenses were only read so far; convert them in the background (status stays 'ready').
    // `running` is watched too: a change saved during a conversion discards its result and
    // clears it, and this starts the conversion again.
    else if (convert && status === 'ready' && !converted && !running) void dispatch(retryConversions(tripId));
  }, [convert, converted, dispatch, running, status, tripId]);

  const { retry: retryTrips } = tripLoad;
  const retry = useCallback(() => {
    retryTrips();
    void dispatch(loadTripExpenses(tripId));
  }, [dispatch, retryTrips, tripId]);

  const convertAgain = useCallback(() => void dispatch(retryConversions(tripId)), [dispatch, tripId]);

  const expenses = useAppSelector((state) => selectTripExpenses(state, tripId));
  const summary = useAppSelector((state) => selectBudgetSummary(state, tripId));

  const screen: BudgetScreenState = useMemo(() => {
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

  /** A conversion is running behind the shown totals (the banner's Try again shows progress). */
  const converting = status === 'ready' && running;

  return { screen, trip, today: tripLoad.today, expenses, summary, retry, convertAgain, converting };
}
