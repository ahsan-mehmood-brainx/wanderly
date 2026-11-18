import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform } from 'react-native';

import { useAppDispatch, useAppSelector } from '@/core/store/hooks';

import { signOut } from '../state/authSlice';
import { selectSignOutPending } from '../state/selectors';

/** Sign-out with a confirmation step. The root navigator returns to sign-in once it completes. */
export function useSignOut() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const pending = useAppSelector(selectSignOutPending);

  const confirmSignOut = useCallback(() => {
    const proceed = () => void dispatch(signOut());
    // react-native-web's Alert can't show buttons; signing back in is quick there.
    if (Platform.OS === 'web') return proceed();
    Alert.alert(t('auth.profile.signOutConfirmTitle'), t('auth.profile.signOutConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('auth.profile.signOut'), style: 'destructive', onPress: proceed },
    ]);
  }, [dispatch, t]);

  return { confirmSignOut, pending };
}
