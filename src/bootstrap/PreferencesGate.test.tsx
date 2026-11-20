import { act, render, screen } from '@testing-library/react-native';
import { getLocales, useLocales } from 'expo-localization';
import { type i18n } from 'i18next';
import { Appearance, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { createI18n } from '@/core/i18n/createI18n';
import { useLayoutDirection } from '@/core/i18n/LayoutDirectionProvider';
import { ok } from '@/core/result';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import {
  DEFAULT_PREFERENCES,
  type LanguagePreference,
  type ThemePreference,
} from '@/features/preferences/domain/Preferences';
import { type PreferencesRepository } from '@/features/preferences/domain/PreferencesRepository';
import { updatePreferences } from '@/features/preferences/presentation/state/preferencesSlice';
import { createTestStore } from '@/testing/createTestStore';
import { InMemoryKeyValueStore } from '@/testing/InMemoryKeyValueStore';
import { layoutDirectionAt } from '@/testing/layoutDirection';
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

function repositoryWith(theme: ThemePreference, language: LanguagePreference): PreferencesRepository {
  return {
    load: () => Promise.resolve(ok({ ...DEFAULT_PREFERENCES, theme, language })),
    save: () => Promise.resolve(ok(undefined)),
  };
}

function DirectionProbe() {
  const { t } = useTranslation();
  const { direction } = useLayoutDirection();
  const { typography } = useAppTheme();
  return (
    <>
      <Text>{t('settings.title')}</Text>
      <Text testID="direction">{direction}</Text>
      <Text testID="probe-body">{`spacing:${String(typography.sectionTitle.letterSpacing ?? 0)}`}</Text>
    </>
  );
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

  describe('in Urdu', () => {
    const URDU_SCRIPT = /[؀-ۿ]/;

    afterEach(() => {
      jest.mocked(useLocales).mockReturnValue(englishDevice);
    });

    it('TC-01 starts in Urdu and right to left when the app is built again from the same storage', async () => {
      const keyValueStore = new InMemoryKeyValueStore();
      const first = await renderWithProviders(<DirectionProbe />, { dependencies: { keyValueStore } });
      await screen.findByText('Settings');
      await act(() => first.store.dispatch(updatePreferences({ language: 'ur' })));
      await screen.unmount();

      await renderWithProviders(<DirectionProbe />, { dependencies: { keyValueStore }, initialLanguage: 'en' });

      expect(await screen.findByText(URDU_SCRIPT)).toBeOnTheScreen();
      expect(screen.queryByText('Settings')).not.toBeOnTheScreen();
      expect(screen.getByTestId('direction')).toHaveTextContent('rtl');
      expect(layoutDirectionAt(screen.getByTestId('direction'))).toBe('rtl');
    });

    it('TC-01 resolves "system" to Urdu on an Urdu device', async () => {
      jest
        .mocked(useLocales)
        .mockReturnValue([
          { ...englishDevice[0], languageCode: 'ur', languageTag: 'ur-PK', regionCode: 'PK', textDirection: 'rtl' },
        ] as DeviceLocales);

      await renderWithProviders(<DirectionProbe />, {
        dependencies: { preferencesRepository: repositoryWith('system', 'system') },
      });

      expect(await screen.findByText(URDU_SCRIPT)).toBeOnTheScreen();
      expect(screen.getByTestId('direction')).toHaveTextContent('rtl');
    });

    it('TC-03 switches the root layout back to left to right when English is chosen', async () => {
      const { store } = await renderWithProviders(<DirectionProbe />, {
        dependencies: { preferencesRepository: repositoryWith('system', 'ur') },
      });
      await screen.findByText(URDU_SCRIPT);

      await act(() => store.dispatch(updatePreferences({ language: 'en' })));

      expect(await screen.findByText('Settings')).toBeOnTheScreen();
      expect(screen.getByTestId('direction')).toHaveTextContent('ltr');
      expect(layoutDirectionAt(screen.getByTestId('direction'))).not.toBe('rtl');
    });

    it('TC-05 uses Urdu typography without letter spacing, and the regular scale in English', async () => {
      const { store } = await renderWithProviders(<DirectionProbe />, {
        dependencies: { preferencesRepository: repositoryWith('system', 'ur') },
      });
      expect(await screen.findByTestId('probe-body')).toHaveTextContent('spacing:0');

      await act(() => store.dispatch(updatePreferences({ language: 'en' })));

      expect(await screen.findByText('spacing:0.6')).toBeOnTheScreen();
    });
  });
});
