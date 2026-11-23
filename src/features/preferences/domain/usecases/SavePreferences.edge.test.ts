import { AppError } from '@/core/errors/AppError';
import { MockPreferencesRepository } from '@/testing/MockPreferencesRepository';
import { createTestLogger } from '@/testing/testDependencies';

import { applyPreferenceChanges, DEFAULT_PREFERENCES, type Preferences } from '../Preferences';
import { SavePreferences } from './SavePreferences';

const STORED: Preferences = {
  theme: 'dark',
  language: 'ur',
  currency: 'EUR',
  notifications: { tripReminders: true, budgetAlerts: true },
};

describe('SavePreferences edge cases', () => {
  it('changing one notification switch keeps the other one stored', async () => {
    const repository = new MockPreferencesRepository(STORED);
    const save = new SavePreferences(repository, createTestLogger());

    await save.execute({ notifications: { budgetAlerts: false } });

    expect(repository.stored).toEqual({
      ...STORED,
      notifications: { tripReminders: true, budgetAlerts: false },
    });
  });

  it('two quick switch changes both reach storage', async () => {
    const repository = new MockPreferencesRepository(DEFAULT_PREFERENCES);
    const save = new SavePreferences(repository, createTestLogger());

    await Promise.all([
      save.execute({ notifications: { tripReminders: true } }),
      save.execute({ notifications: { budgetAlerts: true } }),
    ]);

    expect(repository.stored.notifications).toEqual({ tripReminders: true, budgetAlerts: true });
  });

  it('writes nothing when storage cannot be read before a switch change', async () => {
    const repository = new MockPreferencesRepository(STORED);
    repository.loadError = new AppError('storage', 'busy');
    const save = new SavePreferences(repository, createTestLogger());

    const result = await save.execute({ notifications: { tripReminders: false } });

    expect(result.ok).toBe(false);
    expect(repository.save).not.toHaveBeenCalled();
  });
});

describe('applyPreferenceChanges edge cases', () => {
  it('keeps every field a change does not mention, including the other notification switch', () => {
    const current: Preferences = {
      ...DEFAULT_PREFERENCES,
      notifications: { tripReminders: false, budgetAlerts: true },
    };

    expect(applyPreferenceChanges(current, { theme: 'light', notifications: { tripReminders: true } })).toEqual({
      ...DEFAULT_PREFERENCES,
      theme: 'light',
      notifications: { tripReminders: true, budgetAlerts: true },
    });
  });

  it('an empty change leaves the preferences as they are', () => {
    expect(applyPreferenceChanges(DEFAULT_PREFERENCES, {})).toEqual(DEFAULT_PREFERENCES);
  });
});
