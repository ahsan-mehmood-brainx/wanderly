import { type KeyValueStore } from '@/core/storage/KeyValueStore';
import { InMemoryKeyValueStore } from '@/testing/InMemoryKeyValueStore';
import { createTestLogger } from '@/testing/testDependencies';

import { DEFAULT_PREFERENCES, type Preferences } from '../domain/Preferences';
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
    const preferences = { ...DEFAULT_PREFERENCES, theme: 'dark', language: 'es' } as const;
    await repository.save(preferences);
    await expect(repository.load()).resolves.toEqual({ ok: true, value: preferences });
  });

  it('TC-01 round-trips Urdu, a currency and notification choices under the same key', async () => {
    const { repository, store } = setup();
    const preferences: Preferences = {
      theme: 'light',
      language: 'ur',
      currency: 'PKR',
      notifications: { tripReminders: true, budgetAlerts: true },
    };

    await repository.save(preferences);

    await expect(repository.load()).resolves.toEqual({ ok: true, value: preferences });
    expect(JSON.parse(store.data.get(PREFERENCES_STORAGE_KEY) ?? 'null')).toEqual(preferences);
  });

  it('TC-10 loads preferences stored before currency and notifications existed with their defaults', async () => {
    const { repository } = setup({ [PREFERENCES_STORAGE_KEY]: JSON.stringify({ theme: 'dark', language: 'es' }) });

    await expect(repository.load()).resolves.toEqual({
      ok: true,
      value: {
        theme: 'dark',
        language: 'es',
        currency: 'system',
        notifications: { tripReminders: false, budgetAlerts: false },
      },
    });
  });

  it('TC-10 falls back for a corrupt currency on its own, keeping the other fields', async () => {
    const { repository } = setup({
      [PREFERENCES_STORAGE_KEY]: JSON.stringify({
        theme: 'dark',
        language: 'ur',
        currency: 'DOGE',
        notifications: { tripReminders: true, budgetAlerts: false },
      }),
    });

    await expect(repository.load()).resolves.toEqual({
      ok: true,
      value: {
        theme: 'dark',
        language: 'ur',
        currency: 'system',
        notifications: { tripReminders: true, budgetAlerts: false },
      },
    });
  });

  it('TC-10 falls back for a corrupt notification flag on its own, keeping the other flag', async () => {
    const { repository } = setup({
      [PREFERENCES_STORAGE_KEY]: JSON.stringify({
        theme: 'light',
        language: 'en',
        currency: 'EUR',
        notifications: { tripReminders: 'yes', budgetAlerts: true },
      }),
    });

    await expect(repository.load()).resolves.toEqual({
      ok: true,
      value: {
        theme: 'light',
        language: 'en',
        currency: 'EUR',
        notifications: { tripReminders: false, budgetAlerts: true },
      },
    });
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
    await expect(repository.load()).resolves.toEqual({
      ok: true,
      value: { ...DEFAULT_PREFERENCES, theme: 'dark', language: 'system' },
    });
  });

  it('fills in fields missing from older stored versions', async () => {
    const { repository } = setup({ [PREFERENCES_STORAGE_KEY]: JSON.stringify({ theme: 'light' }) });
    await expect(repository.load()).resolves.toEqual({
      ok: true,
      value: { ...DEFAULT_PREFERENCES, theme: 'light', language: 'system' },
    });
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
