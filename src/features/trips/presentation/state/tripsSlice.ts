import { createEntityAdapter, createSlice, isAnyOf, isPending, isRejected } from '@reduxjs/toolkit';

import { type AppErrorKind } from '@/core/errors/AppError';
import { createAppAsyncThunk } from '@/core/store/hooks';
import { sessionExpired, signIn, signOut } from '@/features/auth/presentation/state/authSlice';

import { type Trip, type TripInput } from '../../domain/Trip';
import { type SaveTripOutcome, type UpdateTripInput } from '../../domain/usecases/tripUseCases';
import { type TripValidationErrors } from '../../domain/tripValidation';

/** Serialisable result of a change (actions must not carry `AppError` instances). */
export type TripChangeOutcome =
  | { readonly status: 'saved'; readonly trip: Trip }
  | { readonly status: 'invalid'; readonly errors: TripValidationErrors }
  | { readonly status: 'failed'; readonly errorKind: AppErrorKind };

export type TripDeleteOutcome =
  { readonly status: 'deleted'; readonly id: string } | { readonly status: 'failed'; readonly errorKind: AppErrorKind };

type TripsLoad =
  { readonly ok: true; readonly trips: readonly Trip[] } | { readonly ok: false; readonly errorKind: AppErrorKind };

const tripsAdapter = createEntityAdapter<Trip>();

/**
 * A copy of the signed-in account's trips for the UI. SQLite stays the source of
 * truth: trips are read once per session, and each change is saved there first and
 * mirrored here only after it succeeded. The `status` kept here is from when the
 * trip was read; selectors re-derive it for today.
 *
 * The copy is dropped whenever the account changes. Results are accepted only from
 * the request recorded here, so one that finishes after sign-out can't bring the
 * previous account's trips back.
 */
const initialState = tripsAdapter.getInitialState({
  status: 'idle' as 'idle' | 'loading' | 'ready' | 'failed',
  errorKind: null as AppErrorKind | null,
  loadRequestId: null as string | null,
  /** The change being written; further ones wait, so the overlap check can't race another save. */
  changeRequestId: null as string | null,
});

export type TripsState = typeof initialState;

const toChangeOutcome = (outcome: SaveTripOutcome): TripChangeOutcome =>
  outcome.status === 'failed' ? { status: 'failed', errorKind: outcome.error.kind } : outcome;

const notSaving = {
  condition: (_: unknown, { getState }: { getState: () => { trips: TripsState } }) =>
    getState().trips.changeRequestId === null,
};

export const loadTrips = createAppAsyncThunk(
  'trips/load',
  async (_: void, { extra }): Promise<TripsLoad> => {
    const result = await extra.getTrips.execute();
    return result.ok ? { ok: true, trips: result.value } : { ok: false, errorKind: result.error.kind };
  },
  {
    // Signed out there is nothing to load; the next sign-in starts from `idle`.
    condition: (_, { getState, extra }) => {
      const { status } = getState().trips;
      return extra.tripOwnerProvider.currentOwnerId() !== null && (status === 'idle' || status === 'failed');
    },
  },
);

export const createTrip = createAppAsyncThunk(
  'trips/create',
  async (input: TripInput, { extra }) => toChangeOutcome(await extra.createTrip.execute(input)),
  notSaving,
);

export const updateTrip = createAppAsyncThunk(
  'trips/update',
  async (input: UpdateTripInput, { extra }) => toChangeOutcome(await extra.updateTrip.execute(input)),
  notSaving,
);

export const setTripCancelled = createAppAsyncThunk(
  'trips/setCancelled',
  async (input: { readonly id: string; readonly cancelled: boolean }, { extra }) =>
    toChangeOutcome(await extra.setTripCancelled.execute(input)),
  notSaving,
);

export const deleteTrip = createAppAsyncThunk(
  'trips/delete',
  async (id: string, { extra }): Promise<TripDeleteOutcome> => {
    const result = await extra.deleteTrip.execute(id);
    return result.ok ? { status: 'deleted', id } : { status: 'failed', errorKind: result.error.kind };
  },
  notSaving,
);

const tripsSlice = createSlice({
  name: 'trips',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadTrips.pending, (state, { meta }) => {
        state.status = 'loading';
        state.errorKind = null;
        state.loadRequestId = meta.requestId;
      })
      .addCase(loadTrips.fulfilled, (state, { payload, meta }) => {
        if (state.loadRequestId !== meta.requestId) return;
        state.loadRequestId = null;
        if (payload.ok) {
          state.status = 'ready';
          tripsAdapter.setAll(state, payload.trips);
        } else {
          state.status = 'failed';
          state.errorKind = payload.errorKind;
        }
      })
      // Use cases report failures as values; this only covers an unexpected throw.
      .addCase(loadTrips.rejected, (state, { meta }) => {
        if (state.loadRequestId !== meta.requestId) return;
        state.loadRequestId = null;
        state.status = 'failed';
        state.errorKind = 'unknown';
      })
      .addCase(deleteTrip.fulfilled, (state, { payload, meta }) => {
        if (state.changeRequestId !== meta.requestId) return;
        state.changeRequestId = null;
        if (payload.status === 'deleted') tripsAdapter.removeOne(state, payload.id);
      })
      .addMatcher(isPending(createTrip, updateTrip, setTripCancelled, deleteTrip), (state, { meta }) => {
        state.changeRequestId = meta.requestId;
      })
      .addMatcher(
        isAnyOf(createTrip.fulfilled, updateTrip.fulfilled, setTripCancelled.fulfilled),
        (state, { payload, meta }) => {
          if (state.changeRequestId !== meta.requestId) return;
          state.changeRequestId = null;
          if (payload.status === 'saved') tripsAdapter.upsertOne(state, payload.trip);
        },
      )
      // A dispatch refused by `condition` sends no action, so this is always the change that was running.
      .addMatcher(isRejected(createTrip, updateTrip, setTripCancelled, deleteTrip), (state, { meta }) => {
        if (state.changeRequestId === meta.requestId) state.changeRequestId = null;
      })
      // Sign-in is included so nothing can carry over even if an earlier session ended some other way.
      .addMatcher(isAnyOf(signOut.fulfilled, signOut.rejected, sessionExpired, signIn.fulfilled), () => initialState);
  },
});

export const tripsReducer = tripsSlice.reducer;
export const tripsSelectors = tripsAdapter.getSelectors();
