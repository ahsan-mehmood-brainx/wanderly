import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAppDispatch, useAppSelector } from '@/core/store/hooks';

import { hasFieldErrors, validateRegistration, type RegistrationDetails } from '../../domain/Credentials';
import { registerDemoAccount, registrationReset } from '../state/authSlice';
import { selectRegistration } from '../state/selectors';

const EMPTY: RegistrationDetails = { firstName: '', lastName: '', email: '', username: '', password: '' };

/** View model for the demo sign-up form. Same validation behaviour as sign-in. */
export function useRegisterForm() {
  const dispatch = useAppDispatch();
  const registration = useAppSelector(selectRegistration);
  const [details, setDetails] = useState<RegistrationDetails>(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const inFlight = useRef<{ abort: () => void } | null>(null);

  const fieldErrors = useMemo(() => (submitted ? validateRegistration(details) : {}), [submitted, details]);

  // Each visit starts fresh; leaving mid-request cancels it.
  useEffect(() => {
    dispatch(registrationReset());
    return () => {
      inFlight.current?.abort();
      dispatch(registrationReset());
    };
  }, [dispatch]);

  const setField = useCallback(
    (field: keyof RegistrationDetails) => (value: string) => setDetails((current) => ({ ...current, [field]: value })),
    [],
  );

  const submit = useCallback(() => {
    setSubmitted(true);
    if (registration.status === 'submitting' || hasFieldErrors(validateRegistration(details))) return;
    inFlight.current = dispatch(registerDemoAccount(details));
  }, [details, dispatch, registration.status]);

  return { details, fieldErrors, setField, submit, registration };
}
