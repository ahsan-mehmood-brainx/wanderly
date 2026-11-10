import { AppError } from '@/core/errors/AppError';
import { err, ok, type Result } from '@/core/result';
import { createAppStore } from '@/core/store/store';
import { createTestDependencies, createTestLogger } from '@/testing/testDependencies';

import { DEFAULT_PREFERENCES, type Preferences } from '../../domain/Preferences';
import { type PreferencesRepository } from '../../domain/PreferencesRepository';
import {
  loadPreferences,
  PREFERENCES_LOAD_TIMEOUT_MS,
  saveErrorDismissed,
  updatePreferences,
} from './preferencesSlice';
import { selectPreferences, selectPreferencesReady, selectPreferencesSaveError } from './selectors';

const storageError = new AppError('storage', 'boom');

function createFakeRepository(overrides: Partial<jest.Mocked<PreferencesRepository>> = {}) {
  const repository: jest.Mocked<PreferencesRepository> = {
    load: jest.fn((): Promise<Result<Preferences, AppError>> => Promise.resolve(ok(DEFAULT_PREFERENCES))),
    save: jest.fn((_preferences: Preferences): Promise<Result<void, AppError>> => Promise.resolve(ok(undefined))),
    ...overrides,
  };
  return repository;
}

function setup(repository: PreferencesRepository = createFakeRepository()) {
  const logger = createTestLogger();
  const store = createAppStore(createTestDependencies({ preferencesRepository: repository, logger }));
  return { store, logger };
}

describe('preferences state', () => {
  describe('loadPreferences', () => {
    it('applies stored preferences and becomes ready', async () => {
      const repository = createFakeRepository({ load: jest.fn().mockResolvedValue(ok({ theme: 'dark', language: 'es' })) });
      const { store } = setup(repository);

      expect(selectPreferencesReady(store.getState())).toBe(false);
      await store.dispatch(loadPreferences());

      expect(selectPreferencesReady(store.getState())).toBe(true);
      expect(selectPreferences(store.getState())).toEqual({ theme: 'dark', language: 'es' });
    });

    it('falls back to defaults and still becomes ready when storage fails', async () => {
      const repository = createFakeRepository({ load: jest.fn().mockResolvedValue(err(storageError)) });
      const { store, logger } = setup(repository);

      await store.dispatch(loadPreferences());

      expect(selectPreferencesReady(store.getState())).toBe(true);
      expect(selectPreferences(store.getState())).toEqual(DEFAULT_PREFERENCES);
      expect(logger.error).toHaveBeenCalled();
    });

    it('falls back to defaults and logs when the repository throws', async () => {
      const repository = createFakeRepository({ load: jest.fn().mockRejectedValue(new Error('contract violation')) });
      const { store, logger } = setup(repository);

      await store.dispatch(loadPreferences());

      expect(selectPreferencesReady(store.getState())).toBe(true);
      expect(selectPreferences(store.getState())).toEqual(DEFAULT_PREFERENCES);
      expect(logger.error).toHaveBeenCalledWith('Preferences repository threw while loading', expect.any(Error));
    });

    it('falls back to defaults if storage never answers', async () => {
      jest.useFakeTimers();
      try {
        const repository = createFakeRepository({ load: jest.fn(() => new Promise<never>(() => undefined)) });
        const { store, logger } = setup(repository);

        const pending = store.dispatch(loadPreferences());
        await jest.advanceTimersByTimeAsync(PREFERENCES_LOAD_TIMEOUT_MS);
        await pending;

        expect(selectPreferencesReady(store.getState())).toBe(true);
        expect(selectPreferences(store.getState())).toEqual(DEFAULT_PREFERENCES);
        expect(logger.warn).toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it('loads only once even if dispatched repeatedly', async () => {
      const repository = createFakeRepository();
      const { store } = setup(repository);

      await Promise.all([store.dispatch(loadPreferences()), store.dispatch(loadPreferences())]);
      await store.dispatch(loadPreferences());

      expect(repository.load).toHaveBeenCalledTimes(1);
    });
  });

  describe('updatePreferences', () => {
    it('applies the change immediately and persists the merged preferences', async () => {
      const repository = createFakeRepository();
      const { store } = setup(repository);
      await store.dispatch(loadPreferences());

      const pending = store.dispatch(updatePreferences({ theme: 'dark' }));
      expect(selectPreferences(store.getState()).theme).toBe('dark');
      await pending;

      expect(repository.save).toHaveBeenCalledWith({ theme: 'dark', language: 'system' });
      expect(selectPreferencesSaveError(store.getState())).toBeNull();
    });

    it('keeps the change for the session and reports an error when saving fails', async () => {
      const repository = createFakeRepository({ save: jest.fn().mockResolvedValue(err(storageError)) });
      const { store } = setup(repository);
      await store.dispatch(loadPreferences());

      await store.dispatch(updatePreferences({ language: 'es' }));

      expect(selectPreferences(store.getState()).language).toBe('es');
      expect(selectPreferencesSaveError(store.getState())).toBe('storage');

      store.dispatch(saveErrorDismissed());
      expect(selectPreferencesSaveError(store.getState())).toBeNull();
    });

    it('reports a storage error and logs when the repository throws while saving', async () => {
      const repository = createFakeRepository({ save: jest.fn().mockRejectedValue(new Error('contract violation')) });
      const { store, logger } = setup(repository);
      await store.dispatch(loadPreferences());

      await store.dispatch(updatePreferences({ theme: 'dark' }));

      expect(selectPreferences(store.getState()).theme).toBe('dark');
      expect(selectPreferencesSaveError(store.getState())).toBe('storage');
      expect(logger.error).toHaveBeenCalledWith('Preferences repository threw while saving', expect.any(Error));
    });

    it('ignores a failure from an older save once a newer save has started', async () => {
      let failFirstSave: (result: Result<void, AppError>) => void = () => undefined;
      const save = jest
        .fn<Promise<Result<void, AppError>>, [Preferences]>()
        .mockImplementationOnce(() => new Promise((resolve) => (failFirstSave = resolve)))
        .mockResolvedValueOnce(ok(undefined));
      const { store } = setup(createFakeRepository({ save }));
      await store.dispatch(loadPreferences());

      const first = store.dispatch(updatePreferences({ theme: 'dark' }));
      await store.dispatch(updatePreferences({ theme: 'light' }));
      failFirstSave(err(storageError));
      await first;

      expect(selectPreferences(store.getState()).theme).toBe('light');
      expect(selectPreferencesSaveError(store.getState())).toBeNull();
    });
  });
});
