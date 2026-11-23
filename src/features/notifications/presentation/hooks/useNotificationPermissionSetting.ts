import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';

import { useDependencies } from '@/core/di/DependenciesProvider';
import { useResolvedPreferences } from '@/features/preferences/presentation/hooks/useResolvedPreferences';

import { type NotificationPermission } from '../../domain/Notification';
import { useSessionReconcile } from './useSessionReconcile';

export interface NotificationPermissionSetting {
  /** `null` while the current permission is being read. */
  readonly permission: NotificationPermission | null;
  readonly requesting: boolean;
  /** Shows the system prompt; only useful while the permission can still be asked for. */
  readonly request: () => void;
  /** Asks only if Wanderly never asked before (a switch was just turned on). */
  readonly requestIfUndetermined: () => void;
  readonly openSettings: () => void;
}

/**
 * The OS notification permission for Settings. Read again whenever the app returns
 * to the foreground, since the traveller may have changed it in system settings.
 */
export function useNotificationPermissionSetting(): NotificationPermissionSetting {
  const { getNotificationPermission, requestNotificationPermission, logger } = useDependencies();
  const reconcile = useSessionReconcile();
  // The Android channels created before the prompt are named in the language the app shows.
  const { language } = useResolvedPreferences();
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [requesting, setRequesting] = useState(false);
  const mounted = useRef(true);
  // Reads and requests can overlap (a foreground re-check while the prompt is
  // answered); only the latest one started may set the status.
  const latestRead = useRef(0);
  const current = useRef<NotificationPermission | null>(null);
  // The read in progress while the permission is still unknown, so a switch turned on meanwhile can wait for it.
  const firstRead = useRef<Promise<NotificationPermission> | null>(null);

  const apply = useCallback((read: number, next: NotificationPermission) => {
    if (!mounted.current || read !== latestRead.current) return;
    current.current = next;
    setPermission(next);
  }, []);

  useEffect(() => {
    mounted.current = true;
    const recheck = () => {
      const read = ++latestRead.current;
      const reading = getNotificationPermission.execute();
      if (current.current === null) firstRead.current = reading;
      void reading.then((next) => apply(read, next));
    };
    recheck();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') recheck();
    });
    return () => {
      mounted.current = false;
      subscription.remove();
    };
  }, [getNotificationPermission, apply]);

  const requestInFlight = useRef(false);
  const request = useCallback(() => {
    // A second tap while the system prompt is on its way would ask the OS again.
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setRequesting(true);
    const read = ++latestRead.current;
    void requestNotificationPermission
      .execute(language)
      .then((next) => {
        apply(read, next);
        // A newly granted permission lets the reminders that are on be scheduled now.
        if (next === 'granted') reconcile('settings');
      })
      .finally(() => {
        requestInFlight.current = false;
        if (mounted.current) setRequesting(false);
      });
  }, [requestNotificationPermission, reconcile, apply, language]);

  const requestIfUndetermined = useCallback(() => {
    if (current.current === 'undetermined') {
      request();
      return;
    }
    // Turned on before the permission was read: decide once it is known.
    const reading = current.current === null ? firstRead.current : null;
    void reading?.then(() => {
      if (mounted.current && current.current === 'undetermined') request();
    });
  }, [request]);

  const openSettings = useCallback(() => {
    Linking.openSettings().catch((error: unknown) => logger.warn('Could not open the system settings', { error }));
  }, [logger]);

  return { permission, requesting, request, requestIfUndetermined, openSettings };
}
