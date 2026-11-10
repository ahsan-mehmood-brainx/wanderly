import { getLocales } from 'expo-localization';
import { type i18n } from 'i18next';

import { type AppDependencies } from '@/core/di/AppDependencies';
import { createI18n } from '@/core/i18n/createI18n';
import { ConsoleLogger } from '@/core/logging/Logger';
import { AsyncStorageKeyValueStore } from '@/core/storage/AsyncStorageKeyValueStore';
import { createAppStore, type AppStore } from '@/core/store/store';
import { StoragePreferencesRepository } from '@/features/preferences/data/StoragePreferencesRepository';
import { resolveLanguage } from '@/features/preferences/domain/resolvePreferences';

export interface AppContainer {
  readonly dependencies: AppDependencies;
  readonly store: AppStore;
  readonly i18n: i18n;
}

/** Composition root: the only place concrete implementations are chosen and wired together. */
export function createAppContainer(): AppContainer {
  const logger = new ConsoleLogger(__DEV__);
  const keyValueStore = new AsyncStorageKeyValueStore();

  const dependencies: AppDependencies = {
    logger,
    preferencesRepository: new StoragePreferencesRepository(keyValueStore, logger),
  };

  // Start in the device language; the saved preference is applied once loaded.
  const deviceLanguage = resolveLanguage('system', getLocales().map((locale) => locale.languageCode));

  return {
    dependencies,
    store: createAppStore(dependencies),
    i18n: createI18n(deviceLanguage),
  };
}
