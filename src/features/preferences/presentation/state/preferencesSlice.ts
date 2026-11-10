import { createSlice } from '@reduxjs/toolkit';

import { type AppErrorKind } from '@/core/errors/AppError';
import { createAppAsyncThunk } from '@/core/store/hooks';

import { DEFAULT_PREFERENCES, type Preferences } from '../../domain/Preferences';

export interface PreferencesState {
  readonly values: Preferences;
  /** `ready` once persisted preferences are loaded (or defaults applied); the UI waits for it. */
  readonly status: 'idle' | 'loading' | 'ready';
  readonly saveError: AppErrorKind | null;
  /** Latest save request; older saves that settle late must not override its outcome. */
  readonly latestSaveRequestId: string | null;
}

const initialState: PreferencesState = {
  values: DEFAULT_PREFERENCES,
  status: 'idle',
  saveError: null,
  latestSaveRequestId: null,
};

/**
 * Thunks are thin adapters between Redux and the domain: business rules (timeouts,
 * fallbacks, logging) live in the injected use cases, so they are tested without a store.
 */
export const loadPreferences = createAppAsyncThunk(
  'preferences/load',
  (_: void, { extra }) => extra.loadPreferences.execute(),
  { condition: (_, { getState }) => getState().preferences.status === 'idle' },
);

/**
 * Applies the change immediately (optimistic) and persists only the changed
 * fields. In-memory values may be start-up defaults (if loading failed), so they
 * must never be written over what storage holds.
 * If persisting fails, the change stays active for this session and the UI is told.
 */
export const updatePreferences = createAppAsyncThunk<void, Partial<Preferences>, { rejectValue: AppErrorKind }>(
  'preferences/update',
  async (changes, { extra, rejectWithValue }) => {
    const result = await extra.savePreferences.execute(changes);
    if (!result.ok) return rejectWithValue(result.error.kind);
  },
);

const preferencesSlice = createSlice({
  name: 'preferences',
  initialState,
  reducers: {
    saveErrorDismissed(state) {
      state.saveError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadPreferences.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(loadPreferences.fulfilled, (state, action) => {
        state.values = action.payload;
        state.status = 'ready';
      })
      .addCase(loadPreferences.rejected, (state) => {
        state.status = 'ready';
      })
      .addCase(updatePreferences.pending, (state, action) => {
        state.values = { ...state.values, ...action.meta.arg };
        state.saveError = null;
        state.latestSaveRequestId = action.meta.requestId;
      })
      .addCase(updatePreferences.rejected, (state, action) => {
        if (action.meta.requestId !== state.latestSaveRequestId) return;
        state.saveError = action.payload ?? 'storage';
      });
  },
});

export const { saveErrorDismissed } = preferencesSlice.actions;
export const preferencesReducer = preferencesSlice.reducer;
