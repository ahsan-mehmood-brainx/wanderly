import { useCallback, useSyncExternalStore } from 'react';

import { useDependencies } from '@/core/di/DependenciesProvider';
import { type SyncStatus } from '@/core/sync/SyncEngine';

/** Live sync status (pending and failed changes, phase). Re-renders only when it changes. */
export function useSyncStatus(): SyncStatus {
  const { syncEngine } = useDependencies();
  const subscribe = useCallback((onChange: () => void) => syncEngine.subscribe(onChange), [syncEngine]);
  const getSnapshot = useCallback(() => syncEngine.getSnapshot(), [syncEngine]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
