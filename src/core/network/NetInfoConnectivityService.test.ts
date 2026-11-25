import { type NetInfoState } from '@react-native-community/netinfo';

import { createTestLogger } from '@/testing/testDependencies';

import { type NetInfoSource, NetInfoConnectivityService } from './NetInfoConnectivityService';

const wifi = { type: 'wifi', isConnected: true, isInternetReachable: true, details: null } as unknown as NetInfoState;
const none = { type: 'none', isConnected: false, isInternetReachable: false, details: null } as unknown as NetInfoState;
const unknown = {
  type: 'unknown',
  isConnected: null,
  isInternetReachable: null,
  details: null,
} as unknown as NetInfoState;

function setup(initial: NetInfoState | Error = wifi) {
  let emitNative: (state: NetInfoState) => void = () => undefined;
  const unsubscribe = jest.fn();
  const source: NetInfoSource = {
    addEventListener: jest.fn((listener) => {
      emitNative = listener;
      return unsubscribe;
    }),
    fetch: jest.fn(() => (initial instanceof Error ? Promise.reject(initial) : Promise.resolve(initial))),
  };
  const logger = createTestLogger();
  const service = new NetInfoConnectivityService(logger, source);
  return { service, logger, unsubscribe, emitNative: (state: NetInfoState) => emitNative(state) };
}

const flush = () => new Promise<void>((resolve) => setImmediate(() => resolve()));

describe('NetInfoConnectivityService', () => {
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

  it('ignores an initial reading that resolves after a live event', async () => {
    const { service, emitNative } = setup(wifi);
    emitNative(none);
    await flush();
    expect(service.isOffline()).toBe(true);
  });

  it('treats an unknown reading as online', async () => {
    const { service } = setup(unknown);
    await flush();
    expect(service.getSnapshot()).toEqual({ isConnected: null, isInternetReachable: null, type: 'unknown' });
    expect(service.isOffline()).toBe(false);
  });

  it('logs and stays unknown if the initial reading fails', async () => {
    const { service, logger } = setup(new Error('native failure'));
    await flush();
    expect(service.getSnapshot().isConnected).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('removes the native listener on dispose', () => {
    const { service, unsubscribe } = setup();
    service.dispose();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
