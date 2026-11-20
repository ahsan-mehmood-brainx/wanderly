import { createSlice, isAnyOf } from '@reduxjs/toolkit';

import { type AppErrorKind } from '@/core/errors/AppError';
import { createAppAsyncThunk } from '@/core/store/hooks';
import { sessionExpired, signIn, signOut } from '@/features/auth/presentation/state/authSlice';

import { EMPTY_LOCAL_PROFILE, type LocalProfile } from '../../domain/LocalProfile';
import { type LocalProfileInput, type ProfileValidationErrors } from '../../domain/profileValidation';

export type ProfileLoadStatus = 'idle' | 'loading' | 'ready' | 'failed';

/** Serialisable result of a save (actions must not carry `AppError` instances). */
export type ProfileSaveOutcome =
  | { readonly status: 'saved'; readonly profile: LocalProfile }
  | { readonly status: 'invalid'; readonly errors: ProfileValidationErrors }
  | { readonly status: 'failed'; readonly errorKind: AppErrorKind };

type ProfileLoad =
  { readonly ok: true; readonly profile: LocalProfile } | { readonly ok: false; readonly errorKind: AppErrorKind };

export interface ProfileState {
  readonly profile: LocalProfile;
  readonly status: ProfileLoadStatus;
  readonly errorKind: AppErrorKind | null;
  /** Results are accepted only from this load, so one finishing after sign-out can't bring a profile back. */
  readonly requestId: string | null;
  /** The save being written; further ones are refused, so a double tap saves once. */
  readonly changeRequestId: string | null;
}

/**
 * A copy of the signed-in account's local profile for the UI. Storage stays the
 * source of truth; the copy is dropped whenever the account changes.
 */
const initialState: ProfileState = {
  profile: EMPTY_LOCAL_PROFILE,
  status: 'idle',
  errorKind: null,
  requestId: null,
  changeRequestId: null,
};

export const loadLocalProfile = createAppAsyncThunk(
  'profile/load',
  async (_: void, { extra }): Promise<ProfileLoad> => {
    const result = await extra.getLocalProfile.execute();
    return result.ok ? { ok: true, profile: result.value } : { ok: false, errorKind: result.error.kind };
  },
  {
    condition: (_, { getState, extra }) => {
      const { status } = getState().profile;
      return extra.tripOwnerProvider.currentOwnerId() !== null && (status === 'idle' || status === 'failed');
    },
  },
);

export const saveLocalProfile = createAppAsyncThunk(
  'profile/save',
  async (input: LocalProfileInput, { extra }): Promise<ProfileSaveOutcome> => {
    const outcome = await extra.saveLocalProfile.execute(input);
    return outcome.status === 'failed' ? { status: 'failed', errorKind: outcome.error.kind } : outcome;
  },
  { condition: (_, { getState }) => getState().profile.changeRequestId === null },
);

const profileSlice = createSlice({
  name: 'profile',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadLocalProfile.pending, (state, { meta }) => {
        state.status = 'loading';
        state.errorKind = null;
        state.requestId = meta.requestId;
      })
      .addCase(loadLocalProfile.fulfilled, (state, { payload, meta }) => {
        if (state.requestId !== meta.requestId) return;
        state.requestId = null;
        if (payload.ok) {
          state.profile = payload.profile;
          state.status = 'ready';
        } else {
          state.status = 'failed';
          state.errorKind = payload.errorKind;
        }
      })
      .addCase(loadLocalProfile.rejected, (state, { meta }) => {
        if (state.requestId !== meta.requestId) return;
        state.requestId = null;
        state.status = 'failed';
        state.errorKind = 'unknown';
      })
      .addCase(saveLocalProfile.pending, (state, { meta }) => {
        state.changeRequestId = meta.requestId;
      })
      .addCase(saveLocalProfile.fulfilled, (state, { payload, meta }) => {
        if (state.changeRequestId !== meta.requestId) return;
        state.changeRequestId = null;
        if (payload.status !== 'saved') return;
        state.profile = payload.profile;
        state.status = 'ready';
        state.errorKind = null;
      })
      .addCase(saveLocalProfile.rejected, (state, { meta }) => {
        if (state.changeRequestId === meta.requestId) state.changeRequestId = null;
      })
      // Sign-in is included so nothing can carry over even if an earlier session ended some other way.
      .addMatcher(isAnyOf(signOut.fulfilled, signOut.rejected, sessionExpired, signIn.fulfilled), () => initialState);
  },
});

export const profileReducer = profileSlice.reducer;
