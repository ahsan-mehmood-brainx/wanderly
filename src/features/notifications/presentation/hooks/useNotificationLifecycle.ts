import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useDependencies } from '@/core/di/DependenciesProvider';
import { useAppSelector } from '@/core/store/hooks';
import { selectPreferences } from '@/features/preferences/presentation/state/selectors';

import { type ReconcilePreferences, type ReconcileTrigger } from '../../domain/usecases/notificationUseCases';

/** Wait after a local change before reconciling, so a burst of edits is one run. */
export const RECONCILE_DEBOUNCE_MS = 300;

/**
 * Keeps scheduled notifications in step for as long as someone is signed in
 * (mounted by the signed-in layout): reconciles on mount, after local changes,
 * on return to the foreground and when notification preferences or the language
 * change. Clearing on sign-out or expiry is `useClearNotificationsWhenSignedOut`'s job (at
 * the root), since a launch with an expired session never mounts this hook.
 *
 * Each reconcile follows the preferences in the store (what the UI shows), not
 * storage: a change applies before it is saved, so reading storage would race the save.
 */
export function useNotificationLifecycle(): void {
  const { reconcileNotifications, localChangeLog, logger } = useDependencies();
  const { notifications, language } = useAppSelector(selectPreferences);
  const { tripReminders, budgetAlerts } = notifications;
  const requestDebounced = useRef<((trigger: ReconcileTrigger) => void) | null>(null);
  const preferences = useRef<ReconcilePreferences>({ notifications, language });
  // Declared first, so the effects below (and timers they start) read this render's values.
  useEffect(() => {
    preferences.current = { notifications, language };
  }, [notifications, language]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const reconcile = (trigger: ReconcileTrigger) => {
      if (!active) return;
      void reconcileNotifications.execute({ trigger, preferences: preferences.current }).then((result) => {
        if (!result.ok) logger.warn('Notification reconcile failed', { trigger, kind: result.error.kind });
      });
    };
    const debounced = (trigger: ReconcileTrigger) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        reconcile(trigger);
      }, RECONCILE_DEBOUNCE_MS);
    };
    requestDebounced.current = debounced;

    reconcile('launch');
    const offChanges = localChangeLog.recorded.subscribe(() => debounced('change'));
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') reconcile('foreground');
    });

    return () => {
      active = false;
      requestDebounced.current = null;
      if (timer) clearTimeout(timer);
      offChanges();
      appState.remove();
    };
  }, [reconcileNotifications, localChangeLog, logger]);

  // Debounced, so quickly flipping a switch back and forth is one run.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    requestDebounced.current?.('settings');
  }, [tripReminders, budgetAlerts, language]);
}
