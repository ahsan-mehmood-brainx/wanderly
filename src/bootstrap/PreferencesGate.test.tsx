import { act, render, screen } from '@testing-library/react-native';
import { getLocales, useLocales } from 'expo-localization';
import { type i18n } from 'i18next';
import { Appearance, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { createI18n } from '@/core/i18n/createI18n';
import { ok } from '@/core/result';
import { type PreferencesRepository } from '@/features/preferences/domain/PreferencesRepository';
import { updatePreferences } from '@/features/preferences/presentation/state/preferencesSlice';
import { createTestStore } from '@/testing/createTestStore';
import { renderWithProviders } from '@/testing/renderWithProviders';
import { createTestDependencies } from '@/testing/testDependencies';

import { AppProviders } from './AppProviders';
import { setAppliedLanguage } from './appliedLanguage';

type DeviceLocales = ReturnType<typeof useLocales>;

// jest.setup.ts mocks the device locale as English.
const englishDevice = getLocales() as DeviceLocales;

function TranslatedTitle() {
  const { t } = useTranslation();
  return <Text>{t('settings.title')}</Text>;
}

function repositoryWith(theme: 'system' | 'light' | 'dark', language: 'system' | 'en' | 'es'): PreferencesRepository {
  return { load: () => Promise.resolve(ok({ theme, language })), save: () => Promise.resolve(ok(undefined)) };
}

describe('PreferencesGate', () => {
  it('renders the app only after preferences load, then signals readiness', async () => {
    const onReady = jest.fn();
    await renderWithProviders(<TranslatedTitle />, { onReady });

    expect(await screen.findByText('Settings')).toBeOnTheScreen();
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('applies the saved language on launch', async () => {
    await renderWithProviders(<TranslatedTitle />, {
      dependencies: { preferencesRepository: repositoryWith('system', 'es') },
    });

    expect(await screen.findByText('Ajustes')).toBeOnTheScreen();
    expect(screen.queryByText('Settings')).not.toBeOnTheScreen();
  });

  describe('with the "system" language', () => {
    const spanishDevice: DeviceLocales = [
      { ...englishDevice[0], languageCode: 'es', languageTag: 'es-ES', regionCode: 'ES' },
    ];

    afterEach(() => {
      jest.mocked(useLocales).mockReturnValue(englishDevice);
    });

    function launch(i18n: i18n) {
      const dependencies = createTestDependencies({ preferencesRepository: repositoryWith('system', 'system') });
      const container = { dependencies, store: createTestStore(dependencies), i18n };
      const ui = (
        <AppProviders container={container}>
          <TranslatedTitle />
        </AppProviders>
      );
      return { container, ui };
    }

    it('keeps the language an i18n instance was created in on launch', async () => {
      await render(launch(createI18n('es')).ui);

      expect(await screen.findByText('Ajustes')).toBeOnTheScreen();
    });

    it('applies a device language that changed between container creation and launch', async () => {
      const i18n = createI18n('en');
      setAppliedLanguage(i18n, 'en');
      jest.mocked(useLocales).mockReturnValue(spanishDevice);

      await render(launch(i18n).ui);

      expect(await screen.findByText('Ajustes')).toBeOnTheScreen();
    });

    it('applies a later preference change', async () => {
      const { container, ui } = launch(createI18n('en'));
      await render(ui);
      await screen.findByText('Settings');

      await act(() => container.store.dispatch(updatePreferences({ language: 'es' })));

      expect(await screen.findByText('Ajustes')).toBeOnTheScreen();
    });

    it('applies a device change that happened while the gate was unmounted', async () => {
      const { ui } = launch(createI18n('en'));
      const first = await render(ui);
      await screen.findByText('Settings');
      await first.unmount();

      jest.mocked(useLocales).mockReturnValue(spanishDevice);
      await render(ui);

      expect(await screen.findByText('Ajustes')).toBeOnTheScreen();
    });
  });

  it('applies the saved theme to native UI', async () => {
    const setColorScheme = jest.spyOn(Appearance, 'setColorScheme');
    await renderWithProviders(<TranslatedTitle />, {
      dependencies: { preferencesRepository: repositoryWith('dark', 'system') },
    });

    await screen.findByText('Settings');
    expect(setColorScheme).toHaveBeenLastCalledWith('dark');
    setColorScheme.mockRestore();
  });
});
