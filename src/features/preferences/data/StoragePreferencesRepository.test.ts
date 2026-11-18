import { type KeyValueStore } from '@/core/storage/KeyValueStore';
import { InMemoryKeyValueStore } from '@/testing/InMemoryKeyValueStore';
import { createTestLogger } from '@/testing/testDependencies';

import { DEFAULT_PREFERENCES } from '../domain/Preferences';
import { PREFERENCES_STORAGE_KEY, StoragePreferencesRepository } from './StoragePreferencesRepository';

function setup(initial: Record<string, string> = {}) {
  const store = new InMemoryKeyValueStore(initial);
  const logger = createTestLogger();
  return { store, logger, repository: new StoragePreferencesRepository(store, logger) };
}

const failingStore: KeyValueStore = {
  getItem: () => Promise.reject(new Error('disk unavailable')),
  setItem: () => Promise.reject(new Error('disk full')),
  removeItem: () => Promise.reject(new Error('disk unavailable')),
};

describe('StoragePreferencesRepository', () => {
  it('returns defaults when nothing has been saved', async () => {
    const { repository } = setup();
    await expect(repository.load()).resolves.toEqual({ ok: true, value: DEFAULT_PREFERENCES });
  });

  it('round-trips saved preferences', async () => {
    const { repository } = setup();
    await repository.save({ theme: 'dark', language: 'es' });
    await expect(repository.load()).resolves.toEqual({ ok: true, value: { theme: 'dark', language: 'es' } });
  });

  it('returns defaults and warns when stored data is not valid JSON', async () => {
    const { repository, logger } = setup({ [PREFERENCES_STORAGE_KEY]: '{not json' });
    await expect(repository.load()).resolves.toEqual({ ok: true, value: DEFAULT_PREFERENCES });
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('returns defaults when stored data is not an object', async () => {
    const { repository } = setup({ [PREFERENCES_STORAGE_KEY]: '"dark"' });
    await expect(repository.load()).resolves.toEqual({ ok: true, value: DEFAULT_PREFERENCES });
  });

  it('keeps valid fields when another field is invalid or unsupported', async () => {
    const { repository } = setup({
      [PREFERENCES_STORAGE_KEY]: JSON.stringify({ theme: 'dark', language: 'klingon' }),
    });
    await expect(repository.load()).resolves.toEqual({ ok: true, value: { theme: 'dark', language: 'system' } });
  });

  it('fills in fields missing from older stored versions', async () => {
    const { repository } = setup({ [PREFERENCES_STORAGE_KEY]: JSON.stringify({ theme: 'light' }) });
    await expect(repository.load()).resolves.toEqual({ ok: true, value: { theme: 'light', language: 'system' } });
  });

  it('returns a storage error when storage cannot be read', async () => {
    const repository = new StoragePreferencesRepository(failingStore, createTestLogger());
    const result = await repository.load();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('storage');
  });

  it('returns a storage error when storage cannot be written', async () => {
    const repository = new StoragePreferencesRepository(failingStore, createTestLogger());
    const result = await repository.save(DEFAULT_PREFERENCES);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('storage');
  });
});
