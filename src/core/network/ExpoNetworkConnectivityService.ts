import * as Network from 'expo-network';

import { Subject } from '@/core/events/Subject';
import { type Logger } from '@/core/logging/Logger';

import {
  type ConnectivityService,
  type ConnectivityState,
  isOfflineState,
  isSameConnectivity,
  UNKNOWN_CONNECTIVITY,
} from './ConnectivityService';

function toConnectivityState(state: Network.NetworkState): ConnectivityState {
  return {
    isConnected: state.isConnected ?? null,
    isInternetReachable: state.isInternetReachable ?? null,
    type: (state.type ?? 'unknown').toLowerCase(),
  };
}

/**
 * Adapter from `expo-network` to {@link ConnectivityService}. Listens for native
 * network events for its whole lifetime (it is a container singleton) and re-emits
 * only real changes to its own subscribers.
 */
export class ExpoNetworkConnectivityService implements ConnectivityService {
  private state: ConnectivityState = UNKNOWN_CONNECTIVITY;
  private readonly changes: Subject<ConnectivityState>;
  private readonly nativeSubscription: { remove(): void };
  private hasReceivedEvent = false;

  constructor(private readonly logger: Logger) {
    this.changes = new Subject((error) => logger.error('Connectivity listener threw', error));
    this.nativeSubscription = Network.addNetworkStateListener((state) => {
      this.hasReceivedEvent = true;
      this.update(toConnectivityState(state));
    });
    Network.getNetworkStateAsync().then(
      // An event that arrived first is newer than this initial reading.
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
    this.nativeSubscription.remove();
    this.changes.clear();
  }

  private update(next: ConnectivityState): void {
    if (isSameConnectivity(this.state, next)) return;
    this.state = next;
    this.logger.info('Connectivity changed', { ...next });
    this.changes.emit(next);
  }
}
