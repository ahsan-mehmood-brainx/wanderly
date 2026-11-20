import { type KeyValueStore } from '@/core/storage/KeyValueStore';
import { InMemoryKeyValueStore } from '@/testing/InMemoryKeyValueStore';
import { localProfile } from '@/testing/profileFixtures';
import { createTestLogger } from '@/testing/testDependencies';
import { OTHER_TRIP_OWNER, TRIP_OWNER, TRIPS_NOW } from '@/testing/tripFixtures';

import { EMPTY_LOCAL_PROFILE } from '../domain/LocalProfile';
import { localProfileStorageKey, StorageLocalProfileRepository } from './StorageLocalProfileRepository';

function setup(initial: Record<string, string> = {}) {
  const store = new InMemoryKeyValueStore(initial);
  const logger = createTestLogger();
  return { store, logger, repository: new StorageLocalProfileRepository(store, logger) };
}

const failingStore: KeyValueStore = {
  getItem: () => Promise.reject(new Error('disk unavailable')),
  setItem: () => Promise.reject(new Error('disk full')),
  removeItem: () => Promise.reject(new Error('disk unavailable')),
};

const saved = localProfile({
  displayName: 'Emily J.',
  homeBase: 'Lahore',
  bio: 'Slow travel fan',
  photo: 'profile-photos/photo-1.jpg',
  updatedAt: TRIPS_NOW,
});

describe('StorageLocalProfileRepository', () => {
  it('TC-09 stores one document per account under profile.local.v1.<ownerId>', async () => {
    const { repository, store } = setup();

    await expect(repository.save(TRIP_OWNER, saved)).resolves.toEqual({ ok: true, value: undefined });

    expect(localProfileStorageKey(TRIP_OWNER)).toBe('profile.local.v1.1');
    expect(JSON.parse(store.data.get('profile.local.v1.1') ?? 'null')).toEqual(saved);
  });

  it('TC-09 round-trips the saved profile', async () => {
    const { repository } = setup();
    await repository.save(TRIP_OWNER, saved);

    await expect(repository.load(TRIP_OWNER)).resolves.toEqual({ ok: true, value: saved });
  });

  it('TC-09 keeps another account on the same device from seeing the profile', async () => {
    const { repository } = setup();
    await repository.save(TRIP_OWNER, saved);

    await expect(repository.load(OTHER_TRIP_OWNER)).resolves.toEqual({ ok: true, value: EMPTY_LOCAL_PROFILE });
  });

  it('TC-08 returns the empty profile when nothing was saved', async () => {
    const { repository } = setup();

    await expect(repository.load(TRIP_OWNER)).resolves.toEqual({ ok: true, value: EMPTY_LOCAL_PROFILE });
  });

  it('TC-09 returns the empty profile and warns when the stored document is not JSON', async () => {
    const { repository, logger } = setup({ 'profile.local.v1.1': '{broken' });

    await expect(repository.load(TRIP_OWNER)).resolves.toEqual({ ok: true, value: EMPTY_LOCAL_PROFILE });
    expect(logger.warn).toHaveBeenCalled();
  });

  it('TC-09 falls back per field, keeping the valid ones', async () => {
    const { repository } = setup({
      'profile.local.v1.1': JSON.stringify({ ...saved, bio: 42, photo: { uri: 'x' }, updatedAt: 'yesterday' }),
    });

    await expect(repository.load(TRIP_OWNER)).resolves.toEqual({
      ok: true,
      value: { ...saved, bio: null, photo: null, updatedAt: null },
    });
  });

  it('TC-09 returns a storage error when storage cannot be read', async () => {
    const repository = new StorageLocalProfileRepository(failingStore, createTestLogger());

    const result = await repository.load(TRIP_OWNER);

    expect(!result.ok && result.error.kind).toBe('storage');
  });

  it('TC-09 returns a storage error when storage cannot be written', async () => {
    const repository = new StorageLocalProfileRepository(failingStore, createTestLogger());

    const result = await repository.save(TRIP_OWNER, saved);

    expect(!result.ok && result.error.kind).toBe('storage');
  });
});
