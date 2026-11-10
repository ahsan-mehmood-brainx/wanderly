import { screen } from '@testing-library/react-native';
import { Appearance, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ok } from '@/core/result';
import { type PreferencesRepository } from '@/features/preferences/domain/PreferencesRepository';
import { renderWithProviders } from '@/testing/renderWithProviders';

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
