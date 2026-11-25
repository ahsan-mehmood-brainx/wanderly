import { type KeyValueStore } from '@/core/storage/KeyValueStore';
import { InMemoryKeyValueStore } from '@/testing/InMemoryKeyValueStore';
import { notificationSettings } from '@/testing/notificationFixtures';
import { createTestLogger } from '@/testing/testDependencies';

import { DEFAULT_NOTIFICATION_SETTINGS } from '../domain/NotificationSettings';
import { EMPTY_NOTIFICATION_STATE } from '../domain/repositories';
import {
  NOTIFICATION_SETTINGS_STORAGE_KEY,
  NOTIFICATION_STATE_STORAGE_KEY,
  StorageNotificationRepository,
} from './StorageNotificationRepository';

function setup(initial: Record<string, string> = {}) {
  const store = new InMemoryKeyValueStore(initial);
  const logger = createTestLogger();
  return { store, logger, repository: new StorageNotificationRepository(store, logger) };
}

const failingStore: KeyValueStore = {
  getItem: () => Promise.reject(new Error('disk unavailable')),
  setItem: () => Promise.reject(new Error('disk full')),
  removeItem: () => Promise.reject(new Error('disk unavailable')),
};

describe('StorageNotificationRepository settings', () => {
  it('AC6 starts on the defaults: 1 day before, trip start on, 2 hours before, 80%', async () => {
    const { repository } = setup();

    await expect(repository.loadSettings()).resolves.toEqual({
      ok: true,
      value: {
        upcomingTripDaysBefore: 1,
        tripStartReminder: true,
        activityMinutesBefore: 120,
        budgetThresholdPercent: 80,
      },
    });
  });

  it('AC6 round-trips the choices under notifications.settings.v1', async () => {
    const { repository, store } = setup();
    const settings = notificationSettings({
      upcomingTripDaysBefore: null,
      tripStartReminder: false,
      activityMinutesBefore: 15,
      budgetThresholdPercent: 100,
    });

    await expect(repository.saveSettings(settings)).resolves.toEqual({ ok: true, value: undefined });

    await expect(repository.loadSettings()).resolves.toEqual({ ok: true, value: settings });
    expect(NOTIFICATION_SETTINGS_STORAGE_KEY).toBe('notifications.settings.v1');
    expect(JSON.parse(store.data.get(NOTIFICATION_SETTINGS_STORAGE_KEY) ?? 'null')).toEqual(settings);
  });

  it('AC6 falls back to the default for each corrupt field on its own', async () => {
    const { repository } = setup({
      [NOTIFICATION_SETTINGS_STORAGE_KEY]: JSON.stringify({
        upcomingTripDaysBefore: 5,
        tripStartReminder: false,
        activityMinutesBefore: '30',
        budgetThresholdPercent: 90,
      }),
    });

    await expect(repository.loadSettings()).resolves.toEqual({
      ok: true,
      value: {
        upcomingTripDaysBefore: 1,
        tripStartReminder: false,
        activityMinutesBefore: 120,
        budgetThresholdPercent: 90,
      },
    });
  });

  it('AC6 keeps an explicit "off" (null) rather than falling back', async () => {
    const { repository } = setup({
      [NOTIFICATION_SETTINGS_STORAGE_KEY]: JSON.stringify({
        upcomingTripDaysBefore: null,
        activityMinutesBefore: null,
      }),
    });

    await expect(repository.loadSettings()).resolves.toEqual({
      ok: true,
      value: { ...DEFAULT_NOTIFICATION_SETTINGS, upcomingTripDaysBefore: null, activityMinutesBefore: null },
    });
  });

  it('AC6 uses the defaults and warns when the stored settings are not JSON', async () => {
    const { repository, logger } = setup({ [NOTIFICATION_SETTINGS_STORAGE_KEY]: '{oops' });

    await expect(repository.loadSettings()).resolves.toEqual({ ok: true, value: DEFAULT_NOTIFICATION_SETTINGS });
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('AC6 uses the defaults when the stored settings are not an object', async () => {
    const { repository } = setup({ [NOTIFICATION_SETTINGS_STORAGE_KEY]: '[1,2]' });

    await expect(repository.loadSettings()).resolves.toEqual({ ok: true, value: DEFAULT_NOTIFICATION_SETTINGS });
  });

  it('returns storage errors when the store fails', async () => {
    const repository = new StorageNotificationRepository(failingStore, createTestLogger());

    const loaded = await repository.loadSettings();
    const saved = await repository.saveSettings(DEFAULT_NOTIFICATION_SETTINGS);

    expect(loaded.ok || loaded.error.kind).toBe('storage');
    expect(saved.ok || saved.error.kind).toBe('storage');
  });
});

describe('StorageNotificationRepository state', () => {
  it('AC3 starts with no owner and nothing alerted', async () => {
    const { repository } = setup();

    await expect(repository.loadState()).resolves.toEqual({ ok: true, value: EMPTY_NOTIFICATION_STATE });
    expect(EMPTY_NOTIFICATION_STATE).toEqual({ ownerId: null, budgetAlerted: {} });
  });

  it('AC5 AC9 round-trips the owner and the budget alerts sent under notifications.state.v1', async () => {
    const { repository, store } = setup();
    const state = { ownerId: '1', budgetAlerted: { 'trip-1': 80, 'trip-2': 90 } };

    await repository.saveState(state);

    await expect(repository.loadState()).resolves.toEqual({ ok: true, value: state });
    expect(NOTIFICATION_STATE_STORAGE_KEY).toBe('notifications.state.v1');
    expect(store.data.has(NOTIFICATION_STATE_STORAGE_KEY)).toBe(true);
  });

  it('AC5 drops corrupt alert entries and keeps the owner', async () => {
    const { repository } = setup({
      [NOTIFICATION_STATE_STORAGE_KEY]: JSON.stringify({ ownerId: '1', budgetAlerted: { 'trip-1': 'lots' } }),
    });

    await expect(repository.loadState()).resolves.toEqual({ ok: true, value: { ownerId: '1', budgetAlerted: {} } });
  });

  it('AC3 reads a corrupt owner as nobody', async () => {
    const { repository } = setup({
      [NOTIFICATION_STATE_STORAGE_KEY]: JSON.stringify({ ownerId: 7, budgetAlerted: { 'trip-1': 80 } }),
    });

    await expect(repository.loadState()).resolves.toEqual({
      ok: true,
      value: { ownerId: null, budgetAlerted: { 'trip-1': 80 } },
    });
  });

  it('returns storage errors when the state cannot be read or written', async () => {
    const repository = new StorageNotificationRepository(failingStore, createTestLogger());

    const loaded = await repository.loadState();
    const saved = await repository.saveState(EMPTY_NOTIFICATION_STATE);

    expect(loaded.ok || loaded.error.kind).toBe('storage');
    expect(saved.ok || saved.error.kind).toBe('storage');
  });
});
