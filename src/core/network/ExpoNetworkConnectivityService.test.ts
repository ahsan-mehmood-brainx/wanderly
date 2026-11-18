import * as Network from 'expo-network';

import { createTestLogger } from '@/testing/testDependencies';

import { ExpoNetworkConnectivityService } from './ExpoNetworkConnectivityService';

jest.mock('expo-network', () => ({
  addNetworkStateListener: jest.fn(),
  getNetworkStateAsync: jest.fn(),
  NetworkStateType: { NONE: 'NONE', WIFI: 'WIFI' },
}));

const addListener = jest.mocked(Network.addNetworkStateListener);
const getState = jest.mocked(Network.getNetworkStateAsync);
const wifi = { isConnected: true, isInternetReachable: true, type: Network.NetworkStateType.WIFI };
const none = { isConnected: false, isInternetReachable: false, type: Network.NetworkStateType.NONE };

function setup(initial: Network.NetworkState | Error = wifi) {
  let emitNative: (state: Network.NetworkState) => void = () => undefined;
  const remove = jest.fn();
  addListener.mockImplementation((listener) => {
    emitNative = listener;
    return { remove };
  });
  getState.mockImplementation(() => (initial instanceof Error ? Promise.reject(initial) : Promise.resolve(initial)));
  const logger = createTestLogger();
  const service = new ExpoNetworkConnectivityService(logger);
  return { service, logger, remove, emitNative: (state: Network.NetworkState) => emitNative(state) };
}

const flush = () => new Promise<void>((resolve) => setImmediate(() => resolve()));

describe('ExpoNetworkConnectivityService', () => {
  it('starts unknown (treated as online), then adopts the initial reading', async () => {
    const { service } = setup();
    expect(service.getSnapshot().isConnected).toBeNull();
    expect(service.isOffline()).toBe(false);

    await flush();

    expect(service.getSnapshot()).toEqual({ isConnected: true, isInternetReachable: true, type: 'wifi' });
  });

  it('notifies subscribers of changes and reports offline', async () => {
    const { service, emitNative } = setup();
    await flush();
    const listener = jest.fn();
    service.subscribe(listener);

    emitNative(none);

    expect(listener).toHaveBeenCalledWith({ isConnected: false, isInternetReachable: false, type: 'none' });
    expect(service.isOffline()).toBe(true);
  });

  it('does not notify when nothing changed, and keeps the snapshot identity', async () => {
    const { service, emitNative } = setup();
    await flush();
    const snapshot = service.getSnapshot();
    const listener = jest.fn();
    service.subscribe(listener);

    emitNative(wifi);

    expect(listener).not.toHaveBeenCalled();
    expect(service.getSnapshot()).toBe(snapshot);
  });

  it('ignores a stale initial reading that resolves after a live event', async () => {
    const { service, emitNative } = setup(wifi);
    emitNative(none);
    await flush();
    expect(service.isOffline()).toBe(true);
  });

  it('logs and stays unknown if the initial reading fails', async () => {
    const { service, logger } = setup(new Error('native failure'));
    await flush();
    expect(service.getSnapshot().isConnected).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('removes the native listener on dispose', () => {
    const { service, remove } = setup();
    service.dispose();
    expect(remove).toHaveBeenCalled();
  });
});
