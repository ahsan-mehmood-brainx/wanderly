import { createSlice } from '@reduxjs/toolkit';

import { createAppAsyncThunk } from '@/core/store/hooks';
import { type RootState } from '@/core/store/store';

export interface OnboardingState {
  readonly status: 'idle' | 'loading' | 'ready';
  readonly completed: boolean;
}

const initialState: OnboardingState = { status: 'idle', completed: false };

export const loadOnboardingStatus = createAppAsyncThunk(
  'onboarding/load',
  (_: void, { extra }) => extra.loadOnboardingStatus.execute(),
  { condition: (_, { getState }) => getState().onboarding.status === 'idle' },
);

/** Completes the intro immediately (optimistic); persisting happens in the background. */
export const completeOnboarding = createAppAsyncThunk(
  'onboarding/complete',
  (_: void, { extra }) => extra.completeOnboarding.execute(),
  { condition: (_, { getState }) => !getState().onboarding.completed },
);

const onboardingSlice = createSlice({
  name: 'onboarding',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadOnboardingStatus.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(loadOnboardingStatus.fulfilled, (state, { payload }) => {
        state.status = 'ready';
        state.completed = state.completed || payload;
      })
      .addCase(loadOnboardingStatus.rejected, (state) => {
        state.status = 'ready';
      })
      .addCase(completeOnboarding.pending, (state) => {
        state.completed = true;
      });
  },
});

export const onboardingReducer = onboardingSlice.reducer;

export const selectOnboardingReady = (state: RootState) => state.onboarding.status === 'ready';
export const selectOnboardingCompleted = (state: RootState) => state.onboarding.completed;
