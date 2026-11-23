import { createSelector } from '@reduxjs/toolkit';

import { type AppErrorKind } from '@/core/errors/AppError';
import { type RootState } from '@/core/store/store';
import { type LocalDate } from '@/features/trips/domain/localDate';
import { selectStoredTripById, selectTripGroups } from '@/features/trips/presentation/state/selectors';

import { type BudgetSummary, summarizeBudget } from '../../domain/budgetCalculations';
import { type Expense } from '../../domain/Expense';
import { type BudgetLoadStatus, expensesSelectors } from './budgetSlice';

export const selectBudgetSaving = (state: RootState): boolean => state.budget.changeRequestId !== null;

export const selectBudgetLoadStatus = (state: RootState, tripId: string): BudgetLoadStatus =>
  state.budget.loadByTrip[tripId]?.status ?? 'idle';

export const selectBudgetConverted = (state: RootState, tripId: string): boolean =>
  state.budget.loadByTrip[tripId]?.converted ?? false;

/** True while a load or conversion for the trip is running (its result not in yet). */
export const selectBudgetRunning = (state: RootState, tripId: string): boolean =>
  (state.budget.loadByTrip[tripId]?.requestId ?? null) !== null;

export const selectBudgetErrorKind = (state: RootState, tripId: string): AppErrorKind | null =>
  state.budget.loadByTrip[tripId]?.errorKind ?? null;

export const selectExpenseById = (state: RootState, id: string): Expense | undefined =>
  expensesSelectors.selectById(state.budget, id);

const selectAllExpenses = (state: RootState) => expensesSelectors.selectAll(state.budget);

/** The trip's expenses, newest date first. */
export const selectTripExpenses = createSelector(
  [selectAllExpenses, (_: RootState, tripId: string) => tripId],
  (expenses, tripId): readonly Expense[] =>
    expenses
      .filter((item) => item.tripId === tripId)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt || b.id.localeCompare(a.id)),
);

/** Totals for the trip against its budget and currency, or `null` while the trip isn't loaded. */
export const selectBudgetSummary = createSelector(
  [(state: RootState, tripId: string) => selectStoredTripById(state, tripId), selectTripExpenses],
  (trip, expenses): BudgetSummary | null =>
    trip
      ? summarizeBudget(
          { budget: trip.budget, currency: trip.currency, startDate: trip.startDate, endDate: trip.endDate },
          expenses,
        )
      : null,
);

/** Ongoing trip, then the next upcoming, then the most recently ended; cancelled trips last. */
export const selectDefaultBudgetTripId = (state: RootState, today: LocalDate): string | null => {
  const groups = selectTripGroups(state, today);
  const trip = groups.ongoing[0] ?? groups.upcoming[0] ?? groups.completed[0] ?? groups.cancelled[0];
  return trip?.id ?? null;
};

/** The trip the Budget tab shows: the one picked in the switcher if it still exists, else the default. */
export const selectBudgetTripId = (state: RootState, today: LocalDate): string | null => {
  const picked = state.budget.selectedTripId;
  if (picked !== null && selectStoredTripById(state, picked)) return picked;
  return selectDefaultBudgetTripId(state, today);
};
