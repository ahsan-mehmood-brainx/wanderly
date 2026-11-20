import { useCallback, useEffect } from 'react';

import { useAppDispatch, useAppSelector } from '@/core/store/hooks';

import { loadLocalProfile } from '../state/profileSlice';
import { selectLocalProfile, selectLocalProfileErrorKind, selectLocalProfileStatus } from '../state/selectors';

/** The signed-in account's local profile, loaded on first use. */
export function useLocalProfile() {
  const dispatch = useAppDispatch();
  const profile = useAppSelector(selectLocalProfile);
  const status = useAppSelector(selectLocalProfileStatus);
  const errorKind = useAppSelector(selectLocalProfileErrorKind);

  useEffect(() => {
    // Only the first caller loads: the thunk's condition skips it once loading has started.
    if (status === 'idle') void dispatch(loadLocalProfile());
  }, [dispatch, status]);

  const retry = useCallback(() => void dispatch(loadLocalProfile()), [dispatch]);

  return { profile, status, errorKind, retry };
}
