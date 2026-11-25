import { AppError } from '@/core/errors/AppError';
import { err, ok } from '@/core/result';
import { discoverApi } from '@/features/discover/presentation/state/discoverApi';
import { createTestStore } from '@/testing/createTestStore';
import { FakeConnectivityService, OFFLINE, ONLINE } from '@/testing/FakeConnectivityService';
import { createTestDependencies } from '@/testing/testDependencies';

import { connectRtkQueryToConnectivity } from './rtkQueryConnectivity';

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function setup(initial = ONLINE, failFirst = false) {
  const connectivity = new FakeConnectivityService(initial);
  const execute = jest.fn(async (): Promise<ReturnType<typeof ok<never[]>> | ReturnType<typeof err<AppError>>> =>
    ok([]),
  );
  if (failFirst) execute.mockResolvedValueOnce(err(new AppError('offline', 'offline')));
  const dependencies = createTestDependencies({ connectivity, getPopularCountries: { execute } });
  const store = createTestStore(dependencies);
  const stop = connectRtkQueryToConnectivity(store.dispatch, connectivity);
  const subscription = store.dispatch(discoverApi.endpoints.popularCountries.initiate());
  return { connectivity, execute, store, stop, subscription };
}

describe('connectRtkQueryToConnectivity', () => {
  it('refetches queries on screen when the device comes back online', async () => {
    const { connectivity, execute, stop, subscription } = setup();
    await flush();
    expect(execute).toHaveBeenCalledTimes(1);

    connectivity.set(OFFLINE);
    connectivity.set(ONLINE);
    await flush();

    expect(execute).toHaveBeenCalledTimes(2);
    subscription.unsubscribe();
    stop();
  });

  it('recovers a query that failed while offline', async () => {
    const { connectivity, store, stop, subscription } = setup(OFFLINE, true);
    await flush();
    expect(discoverApi.endpoints.popularCountries.select()(store.getState()).isError).toBe(true);

    connectivity.set(ONLINE);
    await flush();

    expect(discoverApi.endpoints.popularCountries.select()(store.getState()).isSuccess).toBe(true);
    subscription.unsubscribe();
    stop();
  });

  it('does not refetch when only the network type changes', async () => {
    const { connectivity, execute, stop, subscription } = setup();
    await flush();

    connectivity.set({ isConnected: true, isInternetReachable: true, type: 'cellular' });
    await flush();

    expect(execute).toHaveBeenCalledTimes(1);
    subscription.unsubscribe();
    stop();
  });

  it('stops listening when stopped', async () => {
    const { connectivity, execute, stop, subscription } = setup();
    await flush();
    stop();

    connectivity.set(OFFLINE);
    connectivity.set(ONLINE);
    await flush();

    expect(execute).toHaveBeenCalledTimes(1);
    subscription.unsubscribe();
  });
});
