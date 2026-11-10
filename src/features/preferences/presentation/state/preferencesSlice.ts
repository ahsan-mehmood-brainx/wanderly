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

/** Launch is gated on loading preferences, so a hung storage read must not hold the splash screen forever. */
export const PREFERENCES_LOAD_TIMEOUT_MS = 3000;

const TIMED_OUT = Symbol('timedOut');

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export const loadPreferences = createAppAsyncThunk(
  'preferences/load',
  async (_: void, { extra }) => {
    // Unreadable storage must not block launch; every failure path continues with defaults.
    try {
      const result = await withTimeout(extra.preferencesRepository.load(), PREFERENCES_LOAD_TIMEOUT_MS);
      if (result === TIMED_OUT) {
        extra.logger.warn('Loading preferences timed out; using defaults', { timeoutMs: PREFERENCES_LOAD_TIMEOUT_MS });
      } else if (result.ok) {
        return result.value;
      } else {
        extra.logger.error('Could not load preferences', result.error);
      }
    } catch (error) {
      // Repositories should return err(...); a throwing one is a contract violation worth surfacing.
      extra.logger.error('Preferences repository threw while loading', error);
    }
    return DEFAULT_PREFERENCES;
  },
  { condition: (_, { getState }) => getState().preferences.status === 'idle' },
);

/**
 * Applies the change immediately (optimistic) and persists the full set.
 * If persisting fails, the change stays active for this session and the UI is told.
 */
export const updatePreferences = createAppAsyncThunk<void, Partial<Preferences>, { rejectValue: AppErrorKind }>(
  'preferences/update',
  async (_changes, { extra, getState, rejectWithValue }) => {
    let result;
    try {
      result = await extra.preferencesRepository.save(getState().preferences.values);
    } catch (error) {
      // Repositories should return err(...); a throwing one is a contract violation worth surfacing.
      extra.logger.error('Preferences repository threw while saving', error);
      return rejectWithValue('storage');
    }
    if (!result.ok) {
      extra.logger.error('Could not save preferences', result.error);
      return rejectWithValue(result.error.kind);
    }
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
