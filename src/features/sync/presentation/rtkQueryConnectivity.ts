import { setupListeners } from '@reduxjs/toolkit/query';
import { AppState } from 'react-native';

import { type ConnectivityService, isOfflineState } from '@/core/network/ConnectivityService';
import { type AppDispatch } from '@/core/store/store';

/**
 * Feeds connectivity and app focus into RTK Query, which can't see them on React
 * Native by itself (its default listeners use browser events). Queries with
 * `refetchOnReconnect` then refetch when the device comes back online.
 *
 * Only real transitions are dispatched, judged by the app's offline rule
 * (`isConnected === false`), so a change of network type (Wi-Fi → cellular)
 * doesn't refetch everything. Returns a function that stops listening.
 */
export function connectRtkQueryToConnectivity(
  dispatch: AppDispatch,
  connectivity: Pick<ConnectivityService, 'subscribe' | 'isOffline'>,
): () => void {
  return setupListeners(dispatch, (innerDispatch, { onOnline, onOffline, onFocus, onFocusLost }) => {
    let offline = connectivity.isOffline();
    if (offline) innerDispatch(onOffline());
    const stopConnectivity = connectivity.subscribe((state) => {
      const nowOffline = isOfflineState(state);
      if (nowOffline === offline) return;
      offline = nowOffline;
      innerDispatch(nowOffline ? onOffline() : onOnline());
    });
    const appState = AppState.addEventListener('change', (state) => {
      innerDispatch(state === 'active' ? onFocus() : onFocusLost());
    });
    return () => {
      stopConnectivity();
      appState.remove();
    };
  });
}
