import { screen, userEvent } from '@testing-library/react-native';

import { AppError } from '@/core/errors/AppError';
import { err, ok } from '@/core/result';
import { renderWithProviders } from '@/testing/renderWithProviders';

import { DEFAULT_PREFERENCES } from '../../domain/Preferences';
import { type PreferencesRepository } from '../../domain/PreferencesRepository';
import { SettingsScreen } from './SettingsScreen';

describe('SettingsScreen', () => {
  it('shows the current preferences as selected options', async () => {
    await renderWithProviders(<SettingsScreen />);

    expect(await screen.findByRole('radio', { name: 'System' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Dark' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Device language' })).toBeChecked();
    expect(screen.getByText('Currently English')).toBeOnTheScreen();
  });

  it('selects and persists a theme', async () => {
    const user = userEvent.setup();
    const { dependencies } = await renderWithProviders(<SettingsScreen />);

    await user.press(await screen.findByRole('radio', { name: 'Dark' }));

    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'System' })).not.toBeChecked();
    await expect(dependencies.preferencesRepository.load()).resolves.toEqual(
      ok({ theme: 'dark', language: 'system' }),
    );
  });

  it('switches the interface language immediately', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<SettingsScreen />);

    await user.press(await screen.findByRole('radio', { name: 'Español' }));

    expect(await screen.findByText('Apariencia')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Oscuro' })).toBeOnTheScreen();
  });

  it('shows a dismissible error when a change cannot be saved', async () => {
    const user = userEvent.setup();
    const failingRepository: PreferencesRepository = {
      load: () => Promise.resolve(ok(DEFAULT_PREFERENCES)),
      save: () => Promise.resolve(err(new AppError('storage', 'disk full'))),
    };
    await renderWithProviders(<SettingsScreen />, { dependencies: { preferencesRepository: failingRepository } });

    await user.press(await screen.findByRole('radio', { name: 'Light' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't save this change/);
    // The choice still applies for this session.
    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked();

    await user.press(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
  });
});
