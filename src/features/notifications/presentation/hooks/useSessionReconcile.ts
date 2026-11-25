import { useCallback } from 'react';

import { useDependencies } from '@/core/di/DependenciesProvider';
import { useAppStore } from '@/core/store/hooks';
import { type RootState } from '@/core/store/store';
import { selectPreferences } from '@/features/preferences/presentation/state/selectors';

import { type ReconcilePreferences, type ReconcileTrigger } from '../../domain/usecases/notificationUseCases';

/** The preferences reconcile follows, as the session (and so the UI) has them. */
export function selectReconcilePreferences(state: RootState): ReconcilePreferences {
  const { notifications, language } = selectPreferences(state);
  return { notifications, language };
}

/**
 * Starts a reconcile with the session's preferences, read when it starts. A preference
 * change applies to the session before it is saved and stays there if saving fails, so
 * letting reconcile read storage could cancel reminders the UI shows as on.
 */
export function useSessionReconcile(): (trigger: ReconcileTrigger) => void {
  const { reconcileNotifications, logger } = useDependencies();
  const store = useAppStore();
  return useCallback(
    (trigger: ReconcileTrigger) => {
      const preferences = selectReconcilePreferences(store.getState());
      void reconcileNotifications.execute({ trigger, preferences }).then((result) => {
        if (!result.ok) logger.warn('Notification reconcile failed', { trigger, kind: result.error.kind });
      });
    },
    [reconcileNotifications, logger, store],
  );
}
