import { render } from '@testing-library/react-native';
import { type ReactElement } from 'react';

import { AppProviders } from '@/bootstrap/AppProviders';
import { type AppDependencies } from '@/core/di/AppDependencies';
import { createI18n } from '@/core/i18n/createI18n';
import { type SupportedLanguage } from '@/core/i18n/languages';
import { createAppStore } from '@/core/store/store';

import { createTestDependencies } from './testDependencies';

interface RenderOptions {
  readonly dependencies?: Partial<AppDependencies>;
  readonly initialLanguage?: SupportedLanguage;
  readonly onReady?: () => void;
}

/** Renders UI inside the real provider tree (store, i18n, theme, preferences gate). */
export async function renderWithProviders(ui: ReactElement, options: RenderOptions = {}) {
  const dependencies = createTestDependencies(options.dependencies);
  const store = createAppStore(dependencies);
  const i18n = createI18n(options.initialLanguage ?? 'en');

  await render(
    <AppProviders container={{ dependencies, store, i18n }} onReady={options.onReady}>
      {ui}
    </AppProviders>,
  );

  return { store, i18n, dependencies };
}
