import { render } from '@testing-library/react-native';
import { getLocales } from 'expo-localization';
import { type ReactElement } from 'react';

import { AppProviders } from '@/bootstrap/AppProviders';
import { setAppliedLanguage } from '@/bootstrap/appliedLanguage';
import { type AppDependencies } from '@/core/di/AppDependencies';
import { createI18n } from '@/core/i18n/createI18n';
import { type SupportedLanguage } from '@/core/i18n/languages';
import { resolveLanguage } from '@/features/preferences/domain/resolvePreferences';

import { createTestStore } from './createTestStore';
import { createTestDependencies } from './testDependencies';

interface RenderOptions {
  readonly dependencies?: Partial<AppDependencies>;
  /** Starts i18n in a fixed language. Without it, i18n starts like the app: in the device language. */
  readonly initialLanguage?: SupportedLanguage;
  readonly onReady?: () => void;
}

/** Renders UI inside the real provider tree (store, i18n, theme, preferences gate). */
export async function renderWithProviders(ui: ReactElement, options: RenderOptions = {}) {
  const dependencies = createTestDependencies(options.dependencies);
  const store = createTestStore(dependencies);
  const deviceLanguage = resolveLanguage(
    'system',
    getLocales().map((locale) => locale.languageCode),
  );
  const i18n = createI18n(options.initialLanguage ?? deviceLanguage);
  // As `createAppContainer` does, so "system" follows a device language that changes later.
  if (options.initialLanguage === undefined) setAppliedLanguage(i18n, deviceLanguage);

  await render(
    <AppProviders container={{ dependencies, store, i18n }} onReady={options.onReady}>
      {ui}
    </AppProviders>,
  );

  return { store, i18n, dependencies };
}
