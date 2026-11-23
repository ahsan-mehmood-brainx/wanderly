import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useDependencies } from '@/core/di/DependenciesProvider';
import { deepLinkInbox, resolveDeepLink } from '@/shared/navigation/deepLinks';

import { parseNotificationData } from '../../domain/Notification';
import { routeForNotification } from '../notificationRouting';

/**
 * Opens what a tapped notification points to. Signed in, it navigates straight
 * away; during launch or while signed out the link waits in `deepLinkInbox` and
 * opens after sign-in. Mounted by the root navigator, which passes whether the
 * signed-in area is showing.
 */
export function useNotificationResponses(canNavigate: boolean): void {
  const { notificationResponses, tripOwnerProvider } = useDependencies();
  const router = useRouter();
  const canNavigateNow = useRef(canNavigate);

  useEffect(() => {
    canNavigateNow.current = canNavigate;
  }, [canNavigate]);

  useEffect(
    () =>
      notificationResponses.subscribe((data) => {
        if (canNavigateNow.current) {
          const href = routeForNotification(data, tripOwnerProvider.currentOwnerId());
          if (href) router.navigate(href);
          return;
        }
        // Nobody is signed in yet, so the owner can't be checked; account data stays scoped to whoever signs in.
        const parsed = parseNotificationData(data);
        if (parsed && resolveDeepLink(parsed.url)) deepLinkInbox.record(parsed.url);
      }),
    [notificationResponses, tripOwnerProvider, router],
  );
}
