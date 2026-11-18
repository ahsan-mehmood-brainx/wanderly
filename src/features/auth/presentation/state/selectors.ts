import { type RootState } from '@/core/store/store';

export const selectAuthStatus = (state: RootState) => state.auth.status;
export const selectIsAuthenticated = (state: RootState) => state.auth.status === 'authenticated';
export const selectCurrentUser = (state: RootState) => state.auth.user;
export const selectSessionNotice = (state: RootState) => state.auth.notice;
export const selectSignInState = (state: RootState) => state.auth.signIn;
export const selectSignOutPending = (state: RootState) => state.auth.signOutPending;
export const selectProfileState = (state: RootState) => state.auth.profile;
export const selectRegistration = (state: RootState) => state.auth.registration;
