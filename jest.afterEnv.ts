import { cleanup } from '@testing-library/react-native';

import { resetTestStores } from '@/testing/createTestStore';

// Unmount first (queries lose their subscribers and schedule cache expiry), then
// reset the stores, which cancels those timers so Jest can exit promptly.
afterEach(async () => {
  await cleanup();
  resetTestStores();
});
