import { useEffect } from 'react';

import { useDependencies } from '@/core/di/DependenciesProvider';
import { useAppSelector } from '@/core/store/hooks';
import { selectAuthStatus } from '@/features/auth/presentation/state/selectors';

/**
 * Clears every notification whenever nobody is signed in: after sign-out, after the session
 * expires mid-use, and when a launch finds the stored session expired or unreadable. That last
 * case never mounts the signed-in layout, so the clear can't live there: the background task
 * would keep scheduling the previous account's reminders while the app shows sign-in.
 *
 * Mounted once at the root. Clearing is idempotent, so a signed-out launch with nothing
 * stored costs a few reads.
 */
export function useClearNotificationsWhenSignedOut(): void {
  const { clearNotifications } = useDependencies();
  const signedOut = useAppSelector((state) => selectAuthStatus(state) === 'unauthenticated');

  useEffect(() => {
    // ClearNotifications logs its own failures.
    if (signedOut) void clearNotifications.execute();
  }, [signedOut, clearNotifications]);
}
