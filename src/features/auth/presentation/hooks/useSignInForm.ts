import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useDependencies } from '@/core/di/DependenciesProvider';
import { useAppDispatch, useAppSelector } from '@/core/store/hooks';
import { useConnectivity } from '@/shared/hooks/useConnectivity';

import { hasFieldErrors, validateCredentials, type Credentials } from '../../domain/Credentials';
import { DEMO_CREDENTIALS } from '../../domain/DemoAccount';
import { noticeDismissed, signIn, signInErrorDismissed } from '../state/authSlice';
import { selectSessionNotice, selectSignInState } from '../state/selectors';
import { useLockoutCountdown } from './useLockoutCountdown';

/**
 * View model for the sign-in form.
 *
 * Field errors appear only after the first submit, then update live as the user
 * fixes them. Submission is ignored while a request is in flight or a cooldown
 * is running, and an in-flight request is cancelled if the screen unmounts.
 */
export function useSignInForm() {
  const dispatch = useAppDispatch();
  const { clock } = useDependencies();
  const { pending, error, lockedUntil } = useAppSelector(selectSignInState);
  const notice = useAppSelector(selectSessionNotice);
  const { isOffline } = useConnectivity();
  const lockoutSeconds = useLockoutCountdown(lockedUntil, clock);

  const [credentials, setCredentials] = useState<Credentials>({ username: '', password: '' });
  const [submitted, setSubmitted] = useState(false);
  const inFlight = useRef<{ abort: () => void } | null>(null);

  const fieldErrors = useMemo(() => (submitted ? validateCredentials(credentials) : {}), [submitted, credentials]);

  useEffect(() => () => inFlight.current?.abort(), []);

  const setField = useCallback(
    (field: keyof Credentials) => (value: string) => {
      setCredentials((current) => ({ ...current, [field]: value }));
      if (error) dispatch(signInErrorDismissed());
    },
    [dispatch, error],
  );

  const submit = useCallback(() => {
    setSubmitted(true);
    if (pending || lockoutSeconds > 0 || hasFieldErrors(validateCredentials(credentials))) return;
    if (notice) dispatch(noticeDismissed());
    const request = dispatch(signIn(credentials));
    inFlight.current = request;
    void request.finally(() => {
      if (inFlight.current === request) inFlight.current = null;
    });
  }, [credentials, dispatch, lockoutSeconds, notice, pending]);

  const fillDemoAccount = useCallback(() => {
    setCredentials(DEMO_CREDENTIALS);
    if (error) dispatch(signInErrorDismissed());
  }, [dispatch, error]);

  return {
    credentials,
    fieldErrors,
    setUsername: setField('username'),
    setPassword: setField('password'),
    submit,
    fillDemoAccount,
    pending,
    /** A cooldown message replaces the error that caused it. */
    error: lockoutSeconds > 0 ? null : error,
    lockoutSeconds,
    offline: isOffline,
    notice,
    dismissNotice: () => dispatch(noticeDismissed()),
    dismissError: () => dispatch(signInErrorDismissed()),
  };
}
