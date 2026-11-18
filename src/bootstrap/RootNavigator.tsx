import { Stack, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { useAppDispatch, useAppSelector } from '@/core/store/hooks';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { useSessionLifecycle } from '@/features/auth/presentation/hooks/useSessionLifecycle';
import { loadOnboardingStatus } from '@/features/onboarding/presentation/state/onboardingSlice';
import { routes } from '@/shared/navigation/routes';
import { useDeferredDeepLink } from '@/shared/navigation/useDeferredDeepLink';

import { selectAppPhase, type AppPhase } from './appPhase';

/**
 * Where each phase begins. Every closed guard redirects here explicitly: without
 * it the router picks "the first available screen", and a route group with no
 * index (like `(auth)`) resolves to the not-found screen instead of sign-in.
 */
const PHASE_ENTRY: Readonly<Record<AppPhase, Href>> = {
  splash: '/splash',
  onboarding: '/onboarding',
  auth: routes.signIn,
  app: routes.home,
};

/**
 * Root stack. Each top-level group is behind a `Stack.Protected` guard and
 * exactly one guard is open per {@link AppPhase}, so protection is declarative:
 * when the phase changes (restore finishes, sign-in, sign-out, session expiry)
 * the router drops the closed group's history and shows the open one. No screen
 * navigates "to sign-in" by hand, and a deep link can't reach a closed group.
 *
 * Links that arrive before the user can see them are replayed by `useDeferredDeepLink`.
 */
export function RootNavigator() {
  const { t } = useTranslation();
  const { scheme } = useAppTheme();
  const dispatch = useAppDispatch();
  const phase = useAppSelector(selectAppPhase);

  useSessionLifecycle();
  useEffect(() => {
    void dispatch(loadOnboardingStatus());
  }, [dispatch]);
  useDeferredDeepLink(phase === 'app');
  const entry = PHASE_ENTRY[phase];

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Protected guard={phase === 'splash'} redirectTo={entry}>
          <Stack.Screen name="splash" options={{ animation: 'none' }} />
        </Stack.Protected>
        <Stack.Protected guard={phase === 'onboarding'} redirectTo={entry}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={phase === 'auth'} redirectTo={entry}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={phase === 'app'} redirectTo={entry}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Screen name="+not-found" options={{ headerShown: true, title: t('links.notFoundTitle') }} />
      </Stack>
    </>
  );
}
