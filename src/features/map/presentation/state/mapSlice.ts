import { createSlice, type Draft, type PayloadAction } from '@reduxjs/toolkit';

import { type AppErrorKind } from '@/core/errors/AppError';
import { createAppAsyncThunk } from '@/core/store/hooks';
import { type Coordinates } from '@/features/weather/domain/Coordinates';

import { type CustomMarker } from '../../domain/Place';

export type MapNotice = 'pinLimit' | 'pinSaveFailed';

/** Pins the user dropped on the map (saved on the device). Places and search live in `mapApi`. */
export interface MapState {
  readonly status: 'idle' | 'loading' | 'ready';
  readonly customMarkers: readonly CustomMarker[];
  /** A one-off message about the last pin change. */
  readonly notice: MapNotice | null;
}

const initialState: MapState = { status: 'idle', customMarkers: [], notice: null };

export const loadCustomMarkers = createAppAsyncThunk(
  'map/loadCustomMarkers',
  (_: void, { extra }) => extra.loadCustomMarkers.execute(),
  { condition: (_, { getState }) => getState().map.status === 'idle' },
);

/** Serialisable outcome of a pin change (actions must not carry `AppError` instances). */
type PinChange =
  | { readonly status: 'saved' }
  | { readonly status: 'limitReached' }
  | { readonly status: 'failed'; readonly errorKind: AppErrorKind };

/** The tail of each container's pin-change queue. Keyed weakly so a discarded store's queue is collected. */
const pinChangeQueues = new WeakMap<object, Promise<unknown>>();

/**
 * Runs pin changes for one container one after another. Each change reads the
 * pins when its turn comes and puts the saved list in the store before the next
 * one starts, so two quick long presses (or a remove during an add) never start
 * from the same list and overwrite each other.
 */
function inPinQueue<T>(key: object, change: () => Promise<T>): Promise<T> {
  const previous = pinChangeQueues.get(key) ?? Promise.resolve();
  const run = previous.then(change);
  pinChangeQueues.set(
    key,
    run.catch(() => undefined),
  );
  return run;
}

export const addCustomMarker = createAppAsyncThunk(
  'map/addCustomMarker',
  (coordinates: Coordinates, { extra, getState, dispatch }): Promise<PinChange> =>
    inPinQueue(extra, async () => {
      const outcome = await extra.addCustomMarker.execute({ markers: getState().map.customMarkers, coordinates });
      switch (outcome.status) {
        case 'added':
          dispatch(customMarkersSaved(outcome.markers));
          return { status: 'saved' };
        case 'limitReached':
          return outcome;
        case 'failed':
          return { status: 'failed', errorKind: outcome.error.kind };
      }
    }),
  // Adding before the saved pins are read would overwrite them in storage.
  { condition: (_, { getState }) => getState().map.status === 'ready' },
);

export const removeCustomMarker = createAppAsyncThunk(
  'map/removeCustomMarker',
  (id: string, { extra, getState, dispatch }): Promise<PinChange> =>
    inPinQueue(extra, async () => {
      const result = await extra.removeCustomMarker.execute({ markers: getState().map.customMarkers, id });
      if (!result.ok) return { status: 'failed', errorKind: result.error.kind };
      dispatch(customMarkersSaved(result.value));
      return { status: 'saved' };
    }),
);

function applyPinChange(state: Draft<MapState>, change: PinChange) {
  switch (change.status) {
    case 'saved':
      // The pins themselves were put in the store by `customMarkersSaved`, inside the queue.
      state.notice = null;
      break;
    case 'limitReached':
      state.notice = 'pinLimit';
      break;
    case 'failed':
      // Nothing was saved, so the pins on screen stay as they were.
      state.notice = change.errorKind === 'storage' ? 'pinSaveFailed' : null;
      break;
  }
}

const mapSlice = createSlice({
  name: 'map',
  initialState,
  reducers: {
    dismissMapNotice: (state) => {
      state.notice = null;
    },
    /** Internal: the pin list a queued change just saved. */
    customMarkersSaved: (state, { payload }: PayloadAction<readonly CustomMarker[]>) => {
      state.customMarkers = [...payload];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadCustomMarkers.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(loadCustomMarkers.fulfilled, (state, { payload }) => {
        state.status = 'ready';
        state.customMarkers = [...payload];
      })
      // Loading never fails by contract (unreadable pins are dropped); this only covers an unexpected throw.
      .addCase(loadCustomMarkers.rejected, (state) => {
        state.status = 'ready';
      })
      .addCase(addCustomMarker.fulfilled, (state, { payload }) => applyPinChange(state, payload))
      .addCase(removeCustomMarker.fulfilled, (state, { payload }) => applyPinChange(state, payload));
  },
});

export const { dismissMapNotice } = mapSlice.actions;
const { customMarkersSaved } = mapSlice.actions;
export const mapReducer = mapSlice.reducer;
