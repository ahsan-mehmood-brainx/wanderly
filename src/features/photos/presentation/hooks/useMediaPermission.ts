import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';

import { useDependencies } from '@/core/di/DependenciesProvider';

import { type MediaKind, type MediaPermission } from '../../domain/repositories';
import { allowsAccess } from '../../domain/usecases/photoUseCases';

export interface MediaPermissionState {
  /** `null` while the current permission is being read. */
  readonly permission: MediaPermission | null;
  /** True for `granted` and `limited`. */
  readonly allowed: boolean;
  readonly requesting: boolean;
  /** Shows the system prompt (once, however often it is tapped while the prompt is coming up). */
  readonly request: () => void;
  readonly openSettings: () => void;
}

/**
 * The OS camera or photo library permission. Read again whenever the app returns
 * to the foreground, since the traveller may have changed it in system settings.
 */
export function useMediaPermission(kind: MediaKind): MediaPermissionState {
  const { getMediaPermission, requestMediaPermission, logger } = useDependencies();
  const [permission, setPermission] = useState<MediaPermission | null>(null);
  const [requesting, setRequesting] = useState(false);
  const mounted = useRef(true);
  // Reads and requests can overlap (a foreground re-check while the prompt is
  // answered); only the latest one started may set the permission.
  const latestRead = useRef(0);

  useEffect(() => {
    mounted.current = true;
    const recheck = () => {
      const read = ++latestRead.current;
      void getMediaPermission.execute(kind).then((current) => {
        if (mounted.current && read === latestRead.current) setPermission(current);
      });
    };
    recheck();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') recheck();
    });
    return () => {
      mounted.current = false;
      subscription.remove();
    };
  }, [getMediaPermission, kind]);

  const requestInFlight = useRef(false);
  const request = useCallback(() => {
    // A second tap while the system prompt is on its way would ask the OS again.
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setRequesting(true);
    const read = ++latestRead.current;
    void requestMediaPermission
      .execute(kind)
      .then((current) => {
        if (mounted.current && read === latestRead.current) setPermission(current);
      })
      .finally(() => {
        requestInFlight.current = false;
        if (mounted.current) setRequesting(false);
      });
  }, [requestMediaPermission, kind]);

  const openSettings = useCallback(() => {
    Linking.openSettings().catch((error: unknown) => logger.warn('Could not open the system settings', { error }));
  }, [logger]);

  return {
    permission,
    allowed: permission !== null && allowsAccess(permission),
    requesting,
    request,
    openSettings,
  };
}
