import { getLocales } from 'expo-localization';
import { type i18n } from 'i18next';

import { createAppConfig } from '@/core/config/appConfig';
import { type AppDependencies } from '@/core/di/AppDependencies';
import { createContainer } from '@/core/di/createContainer';
import { createI18n } from '@/core/i18n/createI18n';
import { createAppStore, type AppStore } from '@/core/store/store';
import { preferencesFactories } from '@/features/preferences/di';
import { resolveLanguage } from '@/features/preferences/domain/resolvePreferences';

import { createCoreFactories } from './coreFactories';

export interface AppContainer {
  readonly dependencies: AppDependencies;
  readonly store: AppStore;
  readonly i18n: i18n;
}

/**
 * Composition root: the only place concrete implementations are chosen and wired
 * together. Called once at module load in `src/app/_layout.tsx`, so every service
 * is an app-wide singleton without any global `getInstance()`.
 */
export function createAppContainer(): AppContainer {
  // Start in the device language; the saved preference is applied once loaded.
  const deviceLanguage = resolveLanguage(
    'system',
    getLocales().map((locale) => locale.languageCode),
  );
  const i18n = createI18n(deviceLanguage);

  const dependencies = createContainer<AppDependencies>({
    ...createCoreFactories({ config: createAppConfig(), getLanguage: () => i18n.language }),
    ...preferencesFactories,
  });

  return { dependencies, store: createAppStore(dependencies), i18n };
}
