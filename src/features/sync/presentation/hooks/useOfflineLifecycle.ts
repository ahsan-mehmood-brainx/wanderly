import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo } from 'react-native';

import { useDependencies } from '@/core/di/DependenciesProvider';
import { isOfflineState } from '@/core/network/ConnectivityService';
import { useAppDispatch } from '@/core/store/hooks';

import { connectRtkQueryToConnectivity } from '../rtkQueryConnectivity';

/**
 * Runs the offline machinery for as long as someone is signed in (mounted by the
 * signed-in layout): RTK Query refetches on reconnect, and the sync engine tracks
 * pending changes (and would push them, given a backend), and connectivity changes
 * are announced to screen readers. Signing out unmounts it.
 */
export function useOfflineLifecycle(): void {
  const dispatch = useAppDispatch();
  const { connectivity, syncEngine } = useDependencies();
  const { t } = useTranslation();

  useEffect(() => connectRtkQueryToConnectivity(dispatch, connectivity), [dispatch, connectivity]);
  useEffect(() => syncEngine.start(), [syncEngine]);

  // One announcement per change for screen readers on both platforms (live regions are Android-only).
  useEffect(() => {
    let wasOffline = connectivity.isOffline();
    return connectivity.subscribe((state) => {
      const offline = isOfflineState(state);
      if (offline === wasOffline) return;
      wasOffline = offline;
      AccessibilityInfo.announceForAccessibility(
        offline ? t('offline.indicator.announceOffline') : t('offline.indicator.announceOnline'),
      );
    });
  }, [connectivity, t]);
}
