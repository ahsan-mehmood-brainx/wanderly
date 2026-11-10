import { Subject } from '@/core/events/Subject';
import { type ConnectivityService, type ConnectivityState, isOfflineState } from '@/core/network/ConnectivityService';

export const ONLINE: ConnectivityState = { isConnected: true, isInternetReachable: true, type: 'wifi' };
export const OFFLINE: ConnectivityState = { isConnected: false, isInternetReachable: false, type: 'none' };

/** Connectivity you control from the test: `fake.set(OFFLINE)` notifies subscribers like a real network change. */
export class FakeConnectivityService implements ConnectivityService {
  private readonly changes = new Subject<ConnectivityState>();

  constructor(private state: ConnectivityState = ONLINE) {}

  readonly getSnapshot = () => this.state;
  readonly subscribe = (listener: (state: ConnectivityState) => void) => this.changes.subscribe(listener);
  readonly isOffline = () => isOfflineState(this.state);

  set(state: ConnectivityState): void {
    this.state = state;
    this.changes.emit(state);
  }
}
