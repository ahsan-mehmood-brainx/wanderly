import { InMemoryKeyValueStore } from '@/testing/InMemoryKeyValueStore';
import { createTestLogger } from '@/testing/testDependencies';

import { NOTIFICATION_STATE_STORAGE_KEY, StorageNotificationRepository } from './StorageNotificationRepository';

function setup(initial: Record<string, string> = {}) {
  return new StorageNotificationRepository(new InMemoryKeyValueStore(initial), createTestLogger());
}

describe('StorageNotificationRepository sent-alert owner', () => {
  it('AC5 keeps whose sent budget alerts are remembered after sign-out', async () => {
    const repository = setup();
    const state = { ownerId: null, budgetAlerted: { 'trip-1': 80 }, budgetAlertedOwnerId: 'owner-1' };

    await repository.saveState(state);

    await expect(repository.loadState()).resolves.toEqual({ ok: true, value: state });
  });

  it('AC5 leaves the field out when it was never stored or is unreadable', async () => {
    const repository = setup({
      [NOTIFICATION_STATE_STORAGE_KEY]: JSON.stringify({ ownerId: '1', budgetAlerted: {}, budgetAlertedOwnerId: 7 }),
    });

    const loaded = await repository.loadState();

    expect(loaded.ok && loaded.value).toStrictEqual({ ownerId: '1', budgetAlerted: {} });
  });
});
