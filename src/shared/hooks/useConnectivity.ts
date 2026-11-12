import { useCallback, useSyncExternalStore } from 'react';

import { useDependencies } from '@/core/di/DependenciesProvider';
import { type ConnectivityState, isOfflineState } from '@/core/network/ConnectivityService';

export interface Connectivity extends ConnectivityState {
  /** True only when the device is definitely offline. */
  readonly isOffline: boolean;
}

/** Live connectivity for UI (offline banners, disabling actions). Re-renders only when the state changes. */
export function useConnectivity(): Connectivity {
  const { connectivity } = useDependencies();
  const subscribe = useCallback((onChange: () => void) => connectivity.subscribe(onChange), [connectivity]);
  const getSnapshot = useCallback(() => connectivity.getSnapshot(), [connectivity]);
  const state = useSyncExternalStore(subscribe, getSnapshot);
  return { ...state, isOffline: isOfflineState(state) };
}
