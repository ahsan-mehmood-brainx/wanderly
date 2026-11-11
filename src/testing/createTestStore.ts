import { type AppDependencies } from '@/core/di/AppDependencies';
import { createAppStore, type AppStore, type RootState } from '@/core/store/store';
import { discoverApi } from '@/features/discover/presentation/state/discoverApi';

const liveStores = new Set<AppStore>();

/**
 * `createAppStore` for tests. RTK Query schedules cache-expiry timers (up to
 * 30 minutes) when a query loses its last subscriber; those would keep Jest from
 * exiting. Stores made here are reset after each test (see `jest.afterEnv.ts`),
 * which cancels the timers.
 */
export function createTestStore(dependencies: AppDependencies, preloadedState?: Partial<RootState>): AppStore {
  const store = createAppStore(dependencies, preloadedState);
  liveStores.add(store);
  return store;
}

export function resetTestStores(): void {
  for (const store of liveStores) store.dispatch(discoverApi.util.resetApiState());
  liveStores.clear();
}
