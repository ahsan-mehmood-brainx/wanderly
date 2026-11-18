import { type Observable } from '@/core/events/Subject';

export interface ConnectivityState {
  /** `null` until the first reading arrives. */
  readonly isConnected: boolean | null;
  /** `null` when unknown. On iOS this always equals `isConnected`. */
  readonly isInternetReachable: boolean | null;
  /** Lower-cased connection type, e.g. `wifi`, `cellular`, `none`, `unknown`. */
  readonly type: string;
}

export const UNKNOWN_CONNECTIVITY: ConnectivityState = {
  isConnected: null,
  isInternetReachable: null,
  type: 'unknown',
};

/**
 * Observable connectivity port. Consumers subscribe to changes (Observer) instead of polling:
 * React through `useConnectivity`, the HTTP client by reading the latest snapshot.
 */
export interface ConnectivityService extends Observable<ConnectivityState> {
  /** Latest state. Returns the same object until it changes (safe for `useSyncExternalStore`). */
  getSnapshot(): ConnectivityState;
  /** True only when the device is definitely offline. Unknown state counts as online. */
  isOffline(): boolean;
}

/**
 * Only `isConnected === false` counts as offline. `isInternetReachable` can report
 * `false` on networks that work (captive-portal checks, some VPNs), and failing
 * requests early on a false negative is worse than letting them time out.
 */
export function isOfflineState(state: ConnectivityState): boolean {
  return state.isConnected === false;
}

export function isSameConnectivity(a: ConnectivityState, b: ConnectivityState): boolean {
  return a.isConnected === b.isConnected && a.isInternetReachable === b.isInternetReachable && a.type === b.type;
}
