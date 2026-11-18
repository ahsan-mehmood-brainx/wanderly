import { useCallback, useEffect } from 'react';

import { useDependencies } from '@/core/di/DependenciesProvider';
import { useAppDispatch, useAppSelector } from '@/core/store/hooks';

import { refreshProfile } from '../state/authSlice';
import { selectCurrentUser, selectProfileState } from '../state/selectors';
import { useSignOut } from './useSignOut';

/**
 * View model for the profile screen. Opening it refreshes the profile from
 * `/auth/me`, an authenticated request, so an expired token is renewed (or the
 * session ended) exactly as it would be for any future authenticated API.
 */
export function useProfile() {
  const dispatch = useAppDispatch();
  const { sessionManager, config } = useDependencies();
  const user = useAppSelector(selectCurrentUser);
  const profile = useAppSelector(selectProfileState);
  const { confirmSignOut, pending: signOutPending } = useSignOut();

  useEffect(() => {
    const request = dispatch(refreshProfile());
    return () => request.abort();
  }, [dispatch]);

  /** Development-only: exercises expiry handling without waiting for real expiry. */
  const simulateExpiry = useCallback(
    (scope: 'accessToken' | 'session') => {
      sessionManager.simulateExpiry(scope);
      void dispatch(refreshProfile());
    },
    [dispatch, sessionManager],
  );

  return {
    user,
    refreshFailed: profile.status === 'failed',
    signOutPending,
    confirmSignOut,
    simulateExpiry: config.isDev ? simulateExpiry : null,
  };
}
