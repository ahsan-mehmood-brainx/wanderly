import { createEntityAdapter, createSlice, isAnyOf, isPending, isRejected, type PayloadAction } from '@reduxjs/toolkit';

import { type AppErrorKind } from '@/core/errors/AppError';
import { createAppAsyncThunk } from '@/core/store/hooks';
import { sessionExpired, signIn, signOut } from '@/features/auth/presentation/state/authSlice';
import { type StoredTrip } from '@/features/trips/domain/Trip';
import { deleteTrip, updateTrip } from '@/features/trips/presentation/state/tripsSlice';

import { type Expense } from '../../domain/Expense';
import { type ExpenseValidationErrors } from '../../domain/expenseValidation';
import {
  type CreateExpenseInput,
  type SaveExpenseOutcome,
  type UpdateExpenseInput,
} from '../../domain/usecases/expenseUseCases';

/** Serialisable result of a change (actions must not carry `AppError` instances). */
export type ExpenseChangeOutcome =
  | { readonly status: 'saved'; readonly expense: Expense }
  | { readonly status: 'invalid'; readonly errors: ExpenseValidationErrors }
  | { readonly status: 'failed'; readonly errorKind: AppErrorKind };

export type ExpenseDeleteOutcome =
  { readonly status: 'deleted'; readonly id: string } | { readonly status: 'failed'; readonly errorKind: AppErrorKind };

export type BudgetLoadStatus = 'idle' | 'loading' | 'ready' | 'failed';

export interface BudgetTripLoad {
  readonly status: BudgetLoadStatus;
  readonly errorKind: AppErrorKind | null;
  readonly requestId: string | null;
  /** True once expenses were converted into the trip's currency on this load (not just read). */
  readonly converted: boolean;
}

export type BudgetLoad =
  | { readonly ok: true; readonly trip: StoredTrip; readonly expenses: readonly Expense[] }
  | { readonly ok: false; readonly errorKind: AppErrorKind };

const expensesAdapter = createEntityAdapter<Expense>();

/**
 * A copy of the signed-in account's expenses for the UI, loaded per trip. SQLite
 * stays the source of truth: each change is saved there first and mirrored here
 * only after it succeeded.
 *
 * The copy is dropped whenever the account changes, and a trip's expenses are
 * dropped with the trip. Results are accepted only from the request recorded
 * here, so one that finishes after sign-out can't bring them back.
 */
const initialState = expensesAdapter.getInitialState({
  loadByTrip: {} as Record<string, BudgetTripLoad>,
  /** The change being written; further ones are refused, so a double tap saves once. */
  changeRequestId: null as string | null,
  /** The trip the Budget tab shows; `null` for the default one. */
  selectedTripId: null as string | null,
});

export type BudgetState = typeof initialState;

const toChangeOutcome = (outcome: SaveExpenseOutcome): ExpenseChangeOutcome =>
  outcome.status === 'failed' ? { status: 'failed', errorKind: outcome.error.kind } : outcome;

const notSaving = {
  condition: (_: unknown, { getState }: { getState: () => { budget: BudgetState } }) =>
    getState().budget.changeRequestId === null,
};

/** The trip's expenses as stored, without converting (no network): for screens that only list or show them. */
export const loadTripExpenses = createAppAsyncThunk(
  'budget/loadExpenses',
  async (tripId: string, { extra }): Promise<BudgetLoad> => {
    const result = await extra.getTripExpenses.execute(tripId);
    return result.ok ? { ok: true, ...result.value } : { ok: false, errorKind: result.error.kind };
  },
  {
    // Signed out there is nothing to load; the next sign-in starts from `idle`.
    condition: (tripId, { getState, extra }) => {
      const status = getState().budget.loadByTrip[tripId]?.status ?? 'idle';
      return extra.tripOwnerProvider.currentOwnerId() !== null && (status === 'idle' || status === 'failed');
    },
  },
);

/**
 * Loads the trip again, converting expenses that aren't in the totals yet. Skipped
 * while a load or conversion for the trip is already running, so screens showing
 * the same trip (and repeated Try again taps) share one run.
 */
export const retryConversions = createAppAsyncThunk(
  'budget/retryConversions',
  async (tripId: string, { extra }): Promise<BudgetLoad> => {
    const result = await extra.getTripBudget.execute(tripId);
    return result.ok ? { ok: true, ...result.value } : { ok: false, errorKind: result.error.kind };
  },
  {
    condition: (tripId, { getState, extra }) =>
      extra.tripOwnerProvider.currentOwnerId() !== null &&
      (getState().budget.loadByTrip[tripId]?.requestId ?? null) === null,
  },
);

export const createExpense = createAppAsyncThunk(
  'budget/create',
  async (input: CreateExpenseInput, { extra }): Promise<ExpenseChangeOutcome> =>
    toChangeOutcome(await extra.createExpense.execute(input)),
  notSaving,
);

export const updateExpense = createAppAsyncThunk(
  'budget/update',
  async (input: UpdateExpenseInput, { extra }): Promise<ExpenseChangeOutcome> =>
    toChangeOutcome(await extra.updateExpense.execute(input)),
  notSaving,
);

export const deleteExpense = createAppAsyncThunk(
  'budget/delete',
  async (id: string, { extra }): Promise<ExpenseDeleteOutcome> => {
    const result = await extra.deleteExpense.execute(id);
    return result.ok ? { status: 'deleted', id } : { status: 'failed', errorKind: result.error.kind };
  },
  notSaving,
);

/**
 * Whether the store holds this trip's expenses. A change that finishes after its trip
 * was deleted (which drops this) must not bring the trip's expenses back; a trip that
 * isn't held loads afresh from SQLite when it is next shown.
 */
const holdsTrip = (state: BudgetState, tripId: string) => state.loadByTrip[tripId] !== undefined;

/**
 * A change saved while the trip's load or retry is running makes that result stale
 * (it read SQLite before the change), so it is no longer accepted. A first load
 * starts again from `idle`; a retry keeps what is shown and clears `requestId`, which
 * tells totals screens (`useTripBudget`) to start a new conversion.
 */
function invalidateRunningLoad(state: BudgetState, tripId: string) {
  const load = state.loadByTrip[tripId];
  if (!load || load.requestId === null) return;
  state.loadByTrip[tripId] = {
    status: load.status === 'ready' ? 'ready' : 'idle',
    errorKind: null,
    requestId: null,
    converted: false,
  };
}

function dropTrip(state: BudgetState, tripId: string) {
  expensesAdapter.removeMany(
    state,
    state.ids.filter((id) => state.entities[id]?.tripId === tripId),
  );
  delete state.loadByTrip[tripId];
}

const budgetSlice = createSlice({
  name: 'budget',
  initialState,
  reducers: {
    selectBudgetTrip(state, { payload }: PayloadAction<string>) {
      state.selectedTripId = payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadTripExpenses.pending, (state, { meta }) => {
        state.loadByTrip[meta.arg] = {
          status: 'loading',
          errorKind: null,
          requestId: meta.requestId,
          converted: false,
        };
      })
      // A retry keeps what is shown while it runs; only its own result is accepted.
      .addCase(retryConversions.pending, (state, { meta }) => {
        const previous = state.loadByTrip[meta.arg];
        const status = previous?.status === 'ready' ? 'ready' : 'loading';
        state.loadByTrip[meta.arg] = {
          status,
          errorKind: null,
          requestId: meta.requestId,
          converted: previous?.converted ?? false,
        };
      })
      .addCase(deleteExpense.fulfilled, (state, { payload, meta }) => {
        if (state.changeRequestId !== meta.requestId) return;
        state.changeRequestId = null;
        if (payload.status !== 'deleted') return;
        const tripId = state.entities[payload.id]?.tripId;
        expensesAdapter.removeOne(state, payload.id);
        if (tripId !== undefined) invalidateRunningLoad(state, tripId);
      })
      // The cascade in SQLite already removed them; the trip's budget loads afresh if it ever comes back.
      .addCase(deleteTrip.fulfilled, (state, { payload }) => {
        if (payload.status !== 'deleted') return;
        dropTrip(state, payload.id);
        if (state.selectedTripId === payload.id) state.selectedTripId = null;
      })
      // A new currency means new base amounts: the next view reloads, which converts them.
      // A load still running read the old trip, so its result is no longer accepted either.
      .addCase(updateTrip.fulfilled, (state, { payload }) => {
        if (payload.status !== 'saved' || !state.loadByTrip[payload.trip.id]) return;
        state.loadByTrip[payload.trip.id] = { status: 'idle', errorKind: null, requestId: null, converted: false };
      })
      .addMatcher(isAnyOf(retryConversions.fulfilled, loadTripExpenses.fulfilled), (state, action) => {
        const { payload, meta } = action;
        const previous = state.loadByTrip[meta.arg];
        if (previous?.requestId !== meta.requestId) return;
        if (payload.ok) {
          const stale = state.ids.filter((id) => state.entities[id]?.tripId === meta.arg);
          expensesAdapter.removeMany(state, stale);
          expensesAdapter.upsertMany(state, payload.expenses);
          state.loadByTrip[meta.arg] = {
            status: 'ready',
            errorKind: null,
            requestId: null,
            converted: !loadTripExpenses.fulfilled.match(action),
          };
        } else {
          state.loadByTrip[meta.arg] = {
            status: 'failed',
            errorKind: payload.errorKind,
            requestId: null,
            converted: false,
          };
        }
      })
      // Use cases report failures as values; this only covers an unexpected throw.
      .addMatcher(isAnyOf(retryConversions.rejected, loadTripExpenses.rejected), (state, { meta }) => {
        if (meta.condition || state.loadByTrip[meta.arg]?.requestId !== meta.requestId) return;
        state.loadByTrip[meta.arg] = { status: 'failed', errorKind: 'unknown', requestId: null, converted: false };
      })
      .addMatcher(isPending(createExpense, updateExpense, deleteExpense), (state, { meta }) => {
        state.changeRequestId = meta.requestId;
      })
      .addMatcher(isAnyOf(createExpense.fulfilled, updateExpense.fulfilled), (state, { payload, meta }) => {
        if (state.changeRequestId !== meta.requestId) return;
        state.changeRequestId = null;
        if (payload.status === 'saved' && holdsTrip(state, payload.expense.tripId)) {
          expensesAdapter.upsertOne(state, payload.expense);
          invalidateRunningLoad(state, payload.expense.tripId);
        }
      })
      // A dispatch refused by `condition` sends no action, so this is always the change that was running.
      .addMatcher(isRejected(createExpense, updateExpense, deleteExpense), (state, { meta }) => {
        if (state.changeRequestId === meta.requestId) state.changeRequestId = null;
      })
      // Sign-in is included so nothing can carry over even if an earlier session ended some other way.
      .addMatcher(isAnyOf(signOut.fulfilled, signOut.rejected, sessionExpired, signIn.fulfilled), () => initialState);
  },
});

export const { selectBudgetTrip } = budgetSlice.actions;
export const budgetReducer = budgetSlice.reducer;
export const expensesSelectors = expensesAdapter.getSelectors();
