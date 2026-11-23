import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';

import { useDependencies } from '@/core/di/DependenciesProvider';
import { type LocationPermission } from '@/features/weather/domain/repositories';

export interface LocationPermissionSetting {
  /** `null` while the current permission is being read. */
  readonly permission: LocationPermission | null;
  readonly requesting: boolean;
  /** Shows the system prompt; only useful while the permission can still be asked for. */
  readonly request: () => void;
  readonly openSettings: () => void;
}

/**
 * The OS location permission for Settings. Read again whenever the app returns
 * to the foreground, since the traveller may have changed it in system settings.
 */
export function useLocationPermissionSetting(): LocationPermissionSetting {
  const { checkMapLocationPermission, requestMapLocationPermission, logger } = useDependencies();
  const [permission, setPermission] = useState<LocationPermission | null>(null);
  const [requesting, setRequesting] = useState(false);
  const mounted = useRef(true);
  // Reads and requests can overlap (a foreground re-check while the prompt is
  // answered); only the latest one started may set the status.
  const latestRead = useRef(0);

  useEffect(() => {
    mounted.current = true;
    const recheck = () => {
      const read = ++latestRead.current;
      void checkMapLocationPermission.execute().then((current) => {
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
  }, [checkMapLocationPermission]);

  const requestInFlight = useRef(false);
  const request = useCallback(() => {
    // A second tap while the system prompt is on its way would ask the OS again.
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setRequesting(true);
    const read = ++latestRead.current;
    void requestMapLocationPermission
      .execute()
      .then((current) => {
        if (mounted.current && read === latestRead.current) setPermission(current);
      })
      .finally(() => {
        requestInFlight.current = false;
        if (mounted.current) setRequesting(false);
      });
  }, [requestMapLocationPermission]);

  const openSettings = useCallback(() => {
    Linking.openSettings().catch((error: unknown) => logger.warn('Could not open the system settings', { error }));
  }, [logger]);

  return { permission, requesting, request, openSettings };
}
