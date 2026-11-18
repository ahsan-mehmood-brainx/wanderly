import { createSlice, type Draft } from '@reduxjs/toolkit';

import { type AppErrorKind } from '@/core/errors/AppError';
import { createAppAsyncThunk } from '@/core/store/hooks';

import { type RegisteredAccount } from '../../domain/AuthRepository';
import { type AuthUser } from '../../domain/AuthUser';
import { type Credentials, type RegistrationDetails } from '../../domain/Credentials';
import { type SignInFailure } from '../../domain/usecases/SignIn';

/**
 * - `idle` / `restoring`: start-up, before the stored session has been checked (the launch screen shows).
 * - `authenticated` / `unauthenticated`: decides which navigation tree is reachable.
 */
export type AuthStatus = 'idle' | 'restoring' | 'authenticated' | 'unauthenticated';

/** Why the user is looking at the sign-in screen, when it isn't simply their first visit. */
export type SessionNotice = 'sessionExpired' | 'restoreFailed' | 'signedOut';

export interface AuthState {
  readonly status: AuthStatus;
  /** Profile only. Tokens never enter Redux; `SessionManager` and secure storage hold them. */
  readonly user: AuthUser | null;
  readonly notice: SessionNotice | null;
  readonly signIn: {
    readonly pending: boolean;
    readonly error: AppErrorKind | null;
    readonly lockedUntil: number | null;
  };
  readonly signOutPending: boolean;
  readonly profile: {
    readonly status: 'idle' | 'loading' | 'loaded' | 'failed';
    readonly error: AppErrorKind | null;
  };
  readonly registration: {
    readonly status: 'idle' | 'submitting' | 'succeeded' | 'failed';
    readonly error: AppErrorKind | null;
    readonly account: RegisteredAccount | null;
  };
}

const initialState: AuthState = {
  status: 'idle',
  user: null,
  notice: null,
  signIn: { pending: false, error: null, lockedUntil: null },
  signOutPending: false,
  profile: { status: 'idle', error: null },
  registration: { status: 'idle', error: null, account: null },
};

/** Runs once per launch. */
export const restoreSession = createAppAsyncThunk(
  'auth/restore',
  (_: void, { extra }) => extra.restoreSession.execute(),
  {
    condition: (_, { getState }) => getState().auth.status === 'idle',
  },
);

/**
 * The `condition` drops a second submission while one is in flight (double taps,
 * keyboard submit + button), so the server only ever sees one login at a time.
 */
export const signIn = createAppAsyncThunk<AuthUser, Credentials, { rejectValue: SignInFailure }>(
  'auth/signIn',
  async (credentials, { extra, signal, rejectWithValue }) => {
    const result = await extra.signIn.execute({ credentials, signal });
    return result.ok ? result.value : rejectWithValue(result.error);
  },
  {
    condition: (_, { getState }) => {
      const { auth } = getState();
      return auth.status === 'unauthenticated' && !auth.signIn.pending;
    },
  },
);

export const signOut = createAppAsyncThunk('auth/signOut', (_: void, { extra }) => extra.signOut.execute(), {
  condition: (_, { getState }) => {
    const { auth } = getState();
    return auth.status === 'authenticated' && !auth.signOutPending;
  },
});

export const refreshProfile = createAppAsyncThunk<AuthUser, void, { rejectValue: AppErrorKind }>(
  'auth/refreshProfile',
  async (_, { extra, signal, rejectWithValue }) => {
    const result = await extra.fetchCurrentUser.execute({ signal });
    return result.ok ? result.value : rejectWithValue(result.error.kind);
  },
  { condition: (_, { getState }) => getState().auth.status === 'authenticated' },
);

/**
 * Renews an expired access token, e.g. when the app returns to the foreground
 * after hours away. If the server refuses, `SessionManager` reports expiry and
 * {@link sessionExpired} signs the user out.
 */
export const validateSession = createAppAsyncThunk(
  'auth/validate',
  async (_: void, { extra }) => {
    if (extra.sessionManager.isAccessTokenExpired()) await extra.sessionManager.refresh();
  },
  { condition: (_, { getState }) => getState().auth.status === 'authenticated' },
);

export const registerDemoAccount = createAppAsyncThunk<
  RegisteredAccount,
  RegistrationDetails,
  { rejectValue: AppErrorKind }
>(
  'auth/registerDemo',
  async (details, { extra, signal, rejectWithValue }) => {
    const result = await extra.registerDemoAccount.execute({ details, signal });
    return result.ok ? result.value : rejectWithValue(result.error.kind);
  },
  { condition: (_, { getState }) => getState().auth.registration.status !== 'submitting' },
);

function signedOut(state: Draft<AuthState>, notice: SessionNotice | null): void {
  state.status = 'unauthenticated';
  state.user = null;
  state.notice = notice;
  state.signOutPending = false;
  state.profile = initialState.profile;
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /** Dispatched when the session can no longer be renewed while the user is signed in. */
    sessionExpired(state) {
      if (state.status === 'authenticated') signedOut(state, 'sessionExpired');
    },
    noticeDismissed(state) {
      state.notice = null;
    },
    signInErrorDismissed(state) {
      state.signIn.error = null;
    },
    registrationReset(state) {
      state.registration = initialState.registration;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(restoreSession.pending, (state) => {
        state.status = 'restoring';
      })
      .addCase(restoreSession.fulfilled, (state, { payload }) => {
        if (payload.kind === 'signedIn') {
          state.status = 'authenticated';
          state.user = payload.user;
        } else {
          signedOut(state, payload.reason === 'noSession' ? null : payload.reason);
        }
      })
      // `condition` skips never dispatch `rejected` (no `dispatchConditionRejection`), so this is a real failure.
      .addCase(restoreSession.rejected, (state) => signedOut(state, 'restoreFailed'))

      .addCase(signIn.pending, (state) => {
        state.signIn = { pending: true, error: null, lockedUntil: state.signIn.lockedUntil };
      })
      .addCase(signIn.fulfilled, (state, { payload }) => {
        state.status = 'authenticated';
        state.user = payload;
        state.notice = null;
        state.signIn = initialState.signIn;
      })
      .addCase(signIn.rejected, (state, { payload, meta }) => {
        state.signIn = {
          pending: false,
          // A cancelled attempt (the screen went away) is not an error to show.
          error: meta.aborted ? null : (payload?.kind ?? 'unknown'),
          lockedUntil: payload?.lockedUntil ?? null,
        };
      })

      .addCase(signOut.pending, (state) => {
        state.signOutPending = true;
      })
      // SignOut never fails; the rejected case only covers an unexpected throw. Either way the user is signed out.
      .addCase(signOut.fulfilled, (state) => signedOut(state, 'signedOut'))
      .addCase(signOut.rejected, (state) => signedOut(state, 'signedOut'))

      .addCase(refreshProfile.pending, (state) => {
        state.profile = { status: 'loading', error: null };
      })
      // A result that settles after sign-out belongs to the old session; it must not leak into the next one.
      .addCase(refreshProfile.fulfilled, (state, { payload }) => {
        if (state.status !== 'authenticated') return;
        state.profile = { status: 'loaded', error: null };
        state.user = payload;
      })
      .addCase(refreshProfile.rejected, (state, { payload, meta }) => {
        if (state.status !== 'authenticated') return;
        if (payload === 'sessionExpired') {
          signedOut(state, 'sessionExpired');
          return;
        }
        state.profile = meta.aborted ? initialState.profile : { status: 'failed', error: payload ?? 'unknown' };
      })

      .addCase(registerDemoAccount.pending, (state) => {
        state.registration = { status: 'submitting', error: null, account: null };
      })
      .addCase(registerDemoAccount.fulfilled, (state, { payload }) => {
        state.registration = { status: 'succeeded', error: null, account: payload };
      })
      .addCase(registerDemoAccount.rejected, (state, { payload, meta }) => {
        state.registration = meta.aborted
          ? initialState.registration
          : { status: 'failed', error: payload ?? 'unknown', account: null };
      });
  },
});

export const { sessionExpired, noticeDismissed, signInErrorDismissed, registrationReset } = authSlice.actions;
export const authReducer = authSlice.reducer;
