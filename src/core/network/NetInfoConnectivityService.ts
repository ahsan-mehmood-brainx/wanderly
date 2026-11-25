import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

import { Subject } from '@/core/events/Subject';
import { type Logger } from '@/core/logging/Logger';

import {
  type ConnectivityService,
  type ConnectivityState,
  isOfflineState,
  isSameConnectivity,
  UNKNOWN_CONNECTIVITY,
} from './ConnectivityService';

export function toConnectivityState(state: NetInfoState): ConnectivityState {
  return {
    isConnected: state.isConnected ?? null,
    isInternetReachable: state.isInternetReachable ?? null,
    type: String(state.type ?? 'unknown').toLowerCase(),
  };
}

/** The part of NetInfo this adapter uses, injectable so tests drive it without the native module. */
export interface NetInfoSource {
  addEventListener(listener: (state: NetInfoState) => void): () => void;
  fetch(): Promise<NetInfoState>;
}

/**
 * Adapter from `@react-native-community/netinfo` to {@link ConnectivityService}.
 *
 * NetInfo calls a new listener with the latest state soon after it subscribes, then
 * with every change; the explicit `fetch()` covers platforms where that first call
 * is late. A reading that arrives after a live event is older than it and ignored.
 * Only real changes are re-emitted, so subscribers (UI, HTTP guard, RTK Query
 * reconnect, sync engine) never see duplicates.
 *
 * NetInfo checks reachability with the platform's own validation on iOS and
 * Android (`useNativeReachability`, the default). The app still counts only
 * `isConnected === false` as offline (see `isOfflineState`).
 */
export class NetInfoConnectivityService implements ConnectivityService {
  private state: ConnectivityState = UNKNOWN_CONNECTIVITY;
  private readonly changes: Subject<ConnectivityState>;
  private readonly unsubscribeNative: () => void;
  private hasReceivedEvent = false;

  constructor(
    private readonly logger: Logger,
    source: NetInfoSource = NetInfo,
  ) {
    this.changes = new Subject((error) => logger.error('Connectivity listener threw', error));
    this.unsubscribeNative = source.addEventListener((state) => {
      this.hasReceivedEvent = true;
      this.update(toConnectivityState(state));
    });
    source.fetch().then(
      (state) => {
        if (!this.hasReceivedEvent) this.update(toConnectivityState(state));
      },
      (error: unknown) => logger.warn('Could not read the initial network state', { error: String(error) }),
    );
  }

  // Arrow properties: safe to pass unbound (e.g. to useSyncExternalStore).
  readonly getSnapshot = (): ConnectivityState => this.state;

  readonly subscribe = (listener: (state: ConnectivityState) => void) => this.changes.subscribe(listener);

  readonly isOffline = (): boolean => isOfflineState(this.state);

  dispose(): void {
    this.unsubscribeNative();
    this.changes.clear();
  }

  private update(next: ConnectivityState): void {
    if (isSameConnectivity(this.state, next)) return;
    this.state = next;
    this.logger.info('Connectivity changed', { ...next });
    this.changes.emit(next);
  }
}
