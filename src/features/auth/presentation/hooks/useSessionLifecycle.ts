import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useDependencies } from '@/core/di/DependenciesProvider';
import { useAppDispatch } from '@/core/store/hooks';

import { restoreSession, sessionExpired, validateSession } from '../state/authSlice';

/**
 * App-wide session wiring; mount once, at the root navigator.
 *
 * - Restores the stored session at launch.
 * - Signs the user out (with an explanation) whenever the session can no longer be renewed,
 *   whichever request discovered it.
 * - Renews an expired token when the app returns to the foreground, so the first
 *   screen after a long break doesn't stall on a refresh.
 */
export function useSessionLifecycle(): void {
  const dispatch = useAppDispatch();
  const { sessionManager } = useDependencies();

  useEffect(() => {
    void dispatch(restoreSession());
  }, [dispatch]);

  useEffect(() => sessionManager.onExpired(() => dispatch(sessionExpired())), [dispatch, sessionManager]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void dispatch(validateSession());
    });
    return () => subscription.remove();
  }, [dispatch]);
}
