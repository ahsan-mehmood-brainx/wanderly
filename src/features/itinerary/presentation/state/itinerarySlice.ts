import { createEntityAdapter, createSlice, isAnyOf, isPending, isRejected } from '@reduxjs/toolkit';

import { type AppErrorKind } from '@/core/errors/AppError';
import { createAppAsyncThunk } from '@/core/store/hooks';
import { sessionExpired, signIn, signOut } from '@/features/auth/presentation/state/authSlice';
import { deleteTrip } from '@/features/trips/presentation/state/tripsSlice';

import { type Activity } from '../../domain/Activity';
import { type ActivityValidationErrors } from '../../domain/activityValidation';
import {
  type CreateActivityInput,
  type ReorderActivitiesInput,
  type SaveActivityOutcome,
  type SetActivityCompletedInput,
  type UpdateActivityInput,
} from '../../domain/usecases/activityUseCases';

/** Serialisable result of a change (actions must not carry `AppError` instances). */
export type ActivityChangeOutcome =
  | { readonly status: 'saved'; readonly activity: Activity }
  | { readonly status: 'invalid'; readonly errors: ActivityValidationErrors }
  | { readonly status: 'failed'; readonly errorKind: AppErrorKind };

export type ActivityDeleteOutcome =
  { readonly status: 'deleted'; readonly id: string } | { readonly status: 'failed'; readonly errorKind: AppErrorKind };

export type ActivityReorderOutcome =
  | { readonly status: 'reordered'; readonly activities: readonly Activity[] }
  | { readonly status: 'failed'; readonly errorKind: AppErrorKind };

export type ItineraryLoadStatus = 'idle' | 'loading' | 'ready' | 'failed';

export interface ItineraryTripLoad {
  readonly status: ItineraryLoadStatus;
  readonly errorKind: AppErrorKind | null;
  readonly requestId: string | null;
}

type ItineraryLoad =
  | { readonly ok: true; readonly activities: readonly Activity[] }
  | { readonly ok: false; readonly errorKind: AppErrorKind };

const activitiesAdapter = createEntityAdapter<Activity>();

/**
 * A copy of the signed-in account's activities for the UI, loaded per trip.
 * SQLite stays the source of truth: each change is saved there first and mirrored
 * here only after it succeeded, with the same day renumbering the repository does.
 *
 * The copy is dropped whenever the account changes, and a trip's activities are
 * dropped with the trip. Results are accepted only from the request recorded
 * here, so one that finishes after sign-out can't bring them back.
 */
const initialState = activitiesAdapter.getInitialState({
  loadByTrip: {} as Record<string, ItineraryTripLoad>,
  /** The change being written; further ones are refused, so a double tap saves once. */
  changeRequestId: null as string | null,
});

export type ItineraryState = typeof initialState;

const toChangeOutcome = (outcome: SaveActivityOutcome): ActivityChangeOutcome =>
  outcome.status === 'failed' ? { status: 'failed', errorKind: outcome.error.kind } : outcome;

const notSaving = {
  condition: (_: unknown, { getState }: { getState: () => { itinerary: ItineraryState } }) =>
    getState().itinerary.changeRequestId === null,
};

export const loadItinerary = createAppAsyncThunk(
  'itinerary/load',
  async (tripId: string, { extra }): Promise<ItineraryLoad> => {
    const result = await extra.getItinerary.execute(tripId);
    return result.ok ? { ok: true, activities: result.value } : { ok: false, errorKind: result.error.kind };
  },
  {
    // Signed out there is nothing to load; the next sign-in starts from `idle`.
    condition: (tripId, { getState, extra }) => {
      const status = getState().itinerary.loadByTrip[tripId]?.status ?? 'idle';
      return extra.tripOwnerProvider.currentOwnerId() !== null && (status === 'idle' || status === 'failed');
    },
  },
);

export const createActivity = createAppAsyncThunk(
  'itinerary/create',
  async (input: CreateActivityInput, { extra }): Promise<ActivityChangeOutcome> =>
    toChangeOutcome(await extra.createActivity.execute(input)),
  notSaving,
);

export const updateActivity = createAppAsyncThunk(
  'itinerary/update',
  async (input: UpdateActivityInput, { extra }): Promise<ActivityChangeOutcome> =>
    toChangeOutcome(await extra.updateActivity.execute(input)),
  notSaving,
);

export const setActivityCompleted = createAppAsyncThunk(
  'itinerary/setCompleted',
  async (input: SetActivityCompletedInput, { extra }): Promise<ActivityChangeOutcome> => {
    const result = await extra.setActivityCompleted.execute(input);
    return result.ok ? { status: 'saved', activity: result.value } : { status: 'failed', errorKind: result.error.kind };
  },
  notSaving,
);

export const deleteActivity = createAppAsyncThunk(
  'itinerary/delete',
  async (id: string, { extra }): Promise<ActivityDeleteOutcome> => {
    const result = await extra.deleteActivity.execute(id);
    return result.ok ? { status: 'deleted', id } : { status: 'failed', errorKind: result.error.kind };
  },
  notSaving,
);

export const reorderActivities = createAppAsyncThunk(
  'itinerary/reorder',
  async (input: ReorderActivitiesInput, { extra }): Promise<ActivityReorderOutcome> => {
    const result = await extra.reorderActivities.execute(input);
    return result.ok
      ? { status: 'reordered', activities: result.value }
      : { status: 'failed', errorKind: result.error.kind };
  },
  notSaving,
);

type Day = Pick<Activity, 'tripId' | 'date'>;

function dayActivities(state: ItineraryState, { tripId, date }: Day, exceptId: string | null = null): Activity[] {
  return activitiesAdapter
    .getSelectors()
    .selectAll(state)
    .filter((item) => item.tripId === tripId && item.date === date && item.id !== exceptId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Numbers `ordered` 0..n-1, as the repository does in SQLite. */
function writePositions(state: ItineraryState, ordered: readonly Activity[]) {
  activitiesAdapter.updateMany(
    state,
    ordered.flatMap((item, index) =>
      item.sortOrder === index ? [] : [{ id: item.id, changes: { sortOrder: index } }],
    ),
  );
}

/**
 * Whether the store holds this trip's itinerary. A change that finishes after its trip
 * was deleted (which drops this) must not bring the trip's activities back; a trip that
 * isn't held loads afresh from SQLite when it is next shown.
 */
const holdsTrip = (state: ItineraryState, tripId: string) => state.loadByTrip[tripId] !== undefined;

/** Mirrors a saved activity at its `sortOrder` on its day, closing the gap on the day it left. */
function placeSaved(state: ItineraryState, activity: Activity) {
  if (!holdsTrip(state, activity.tripId)) return;
  const previous = state.entities[activity.id];
  activitiesAdapter.upsertOne(state, activity);
  if (previous && previous.date !== activity.date) writePositions(state, dayActivities(state, previous));
  const others = dayActivities(state, activity, activity.id);
  const index = Math.min(Math.max(activity.sortOrder, 0), others.length);
  writePositions(state, [...others.slice(0, index), activity, ...others.slice(index)]);
}

const itinerarySlice = createSlice({
  name: 'itinerary',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadItinerary.pending, (state, { meta }) => {
        state.loadByTrip[meta.arg] = { status: 'loading', errorKind: null, requestId: meta.requestId };
      })
      .addCase(loadItinerary.fulfilled, (state, { payload, meta }) => {
        if (state.loadByTrip[meta.arg]?.requestId !== meta.requestId) return;
        if (payload.ok) {
          const stale = state.ids.filter((id) => state.entities[id]?.tripId === meta.arg);
          activitiesAdapter.removeMany(state, stale);
          activitiesAdapter.upsertMany(state, payload.activities);
          state.loadByTrip[meta.arg] = { status: 'ready', errorKind: null, requestId: null };
        } else {
          state.loadByTrip[meta.arg] = { status: 'failed', errorKind: payload.errorKind, requestId: null };
        }
      })
      // Use cases report failures as values; this only covers an unexpected throw.
      .addCase(loadItinerary.rejected, (state, { meta }) => {
        if (meta.condition || state.loadByTrip[meta.arg]?.requestId !== meta.requestId) return;
        state.loadByTrip[meta.arg] = { status: 'failed', errorKind: 'unknown', requestId: null };
      })
      .addCase(deleteActivity.fulfilled, (state, { payload, meta }) => {
        if (state.changeRequestId !== meta.requestId) return;
        state.changeRequestId = null;
        if (payload.status !== 'deleted') return;
        const removed = state.entities[payload.id];
        activitiesAdapter.removeOne(state, payload.id);
        if (removed) writePositions(state, dayActivities(state, removed));
      })
      .addCase(reorderActivities.fulfilled, (state, { payload, meta }) => {
        if (state.changeRequestId !== meta.requestId) return;
        state.changeRequestId = null;
        if (payload.status === 'reordered' && holdsTrip(state, meta.arg.tripId)) {
          activitiesAdapter.upsertMany(state, payload.activities);
        }
      })
      // The cascade in SQLite already removed them; the trip's itinerary loads afresh if it ever comes back.
      .addCase(deleteTrip.fulfilled, (state, { payload }) => {
        if (payload.status !== 'deleted') return;
        const tripId = payload.id;
        activitiesAdapter.removeMany(
          state,
          state.ids.filter((id) => state.entities[id]?.tripId === tripId),
        );
        delete state.loadByTrip[tripId];
      })
      .addMatcher(
        isPending(createActivity, updateActivity, setActivityCompleted, deleteActivity, reorderActivities),
        (state, { meta }) => {
          state.changeRequestId = meta.requestId;
        },
      )
      .addMatcher(
        isAnyOf(createActivity.fulfilled, updateActivity.fulfilled, setActivityCompleted.fulfilled),
        (state, { payload, meta }) => {
          if (state.changeRequestId !== meta.requestId) return;
          state.changeRequestId = null;
          if (payload.status === 'saved') placeSaved(state, payload.activity);
        },
      )
      // A dispatch refused by `condition` sends no action, so this is always the change that was running.
      .addMatcher(
        isRejected(createActivity, updateActivity, setActivityCompleted, deleteActivity, reorderActivities),
        (state, { meta }) => {
          if (state.changeRequestId === meta.requestId) state.changeRequestId = null;
        },
      )
      // Sign-in is included so nothing can carry over even if an earlier session ended some other way.
      .addMatcher(isAnyOf(signOut.fulfilled, signOut.rejected, sessionExpired, signIn.fulfilled), () => initialState);
  },
});

export const itineraryReducer = itinerarySlice.reducer;
export const activitiesSelectors = activitiesAdapter.getSelectors();
