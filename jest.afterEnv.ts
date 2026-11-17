import { cleanup } from '@testing-library/react-native';

import { resetTestStores } from '@/testing/createTestStore';
import { installSyncSafeAct } from '@/testing/syncSafeAct';

// `fireEvent`, `unmount` and `rerender` behave the same awaited or not (see syncSafeAct).
installSyncSafeAct();

// Unmount first (queries lose their subscribers and schedule cache expiry), then
// reset the stores, which cancels those timers so Jest can exit promptly.
afterEach(async () => {
  await cleanup();
  resetTestStores();
  // Preset mocks such as `Linking.openURL` are already `jest.fn`s, so `jest.spyOn` reuses them and
  // Jest 30's `restoreAllMocks` leaves their calls in place; start every test with no recorded calls.
  jest.clearAllMocks();
});
