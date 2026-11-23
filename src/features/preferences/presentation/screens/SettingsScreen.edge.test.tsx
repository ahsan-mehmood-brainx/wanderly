import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { I18nManager } from 'react-native';

import { AppError } from '@/core/errors/AppError';
import { err } from '@/core/result';
import { MockPreferencesRepository } from '@/testing/MockPreferencesRepository';
import { renderWithProviders } from '@/testing/renderWithProviders';

import { DEFAULT_PREFERENCES, type Preferences } from '../../domain/Preferences';
import { SettingsScreen } from './SettingsScreen';

const SAVED: Preferences = {
  theme: 'dark',
  language: 'en',
  currency: 'EUR',
  notifications: { tripReminders: false, budgetAlerts: true },
};

describe('SettingsScreen notifications edge cases', () => {
  it('turning one switch on after a failed start-up load keeps the other saved switch', async () => {
    const user = userEvent.setup();
    const repository = new MockPreferencesRepository(SAVED);
    // The start-up read fails, so the app runs on defaults; storage is readable again when saving.
    repository.load.mockResolvedValueOnce(err(new AppError('storage', 'busy')));
    await renderWithProviders(<SettingsScreen />, { dependencies: { preferencesRepository: repository } });

    const tripReminders = await screen.findByRole('switch', { name: 'Trip reminders' });
    expect(tripReminders).not.toBeChecked();
    await user.press(tripReminders);

    await waitFor(() => expect(repository.save).toHaveBeenCalledTimes(1));
    expect(repository.stored).toEqual({
      ...SAVED,
      notifications: { tripReminders: true, budgetAlerts: true },
    });
  });

  it('two quick switch changes are both saved', async () => {
    const user = userEvent.setup();
    const repository = new MockPreferencesRepository(DEFAULT_PREFERENCES);
    await renderWithProviders(<SettingsScreen />, { dependencies: { preferencesRepository: repository } });

    await user.press(await screen.findByRole('switch', { name: 'Trip reminders' }));
    await user.press(screen.getByRole('switch', { name: 'Budget alerts' }));

    await waitFor(() => expect(repository.save).toHaveBeenCalledTimes(2));
    expect(repository.stored.notifications).toEqual({ tripReminders: true, budgetAlerts: true });
    expect(screen.getByRole('switch', { name: 'Trip reminders' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Budget alerts' })).toBeChecked();
  });

  it('turning a switch off again saves it off without touching the other one', async () => {
    const user = userEvent.setup();
    const repository = new MockPreferencesRepository({
      ...DEFAULT_PREFERENCES,
      notifications: { tripReminders: true, budgetAlerts: true },
    });
    await renderWithProviders(<SettingsScreen />, { dependencies: { preferencesRepository: repository } });

    const budgetAlerts = await screen.findByRole('switch', { name: 'Budget alerts' });
    await waitFor(() => expect(budgetAlerts).toBeChecked());
    await user.press(budgetAlerts);

    await waitFor(() => expect(repository.save).toHaveBeenCalledTimes(1));
    expect(repository.stored.notifications).toEqual({ tripReminders: true, budgetAlerts: false });
  });

  it('a switch that cannot be saved still applies for the session and shows the save error', async () => {
    const user = userEvent.setup();
    const repository = new MockPreferencesRepository(DEFAULT_PREFERENCES);
    repository.saveError = new AppError('storage', 'disk full');
    await renderWithProviders(<SettingsScreen />, { dependencies: { preferencesRepository: repository } });

    await user.press(await screen.findByRole('switch', { name: 'Budget alerts' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't save this change/);
    expect(screen.getByRole('switch', { name: 'Budget alerts' })).toBeChecked();
    expect(repository.stored.notifications.budgetAlerts).toBe(false);
  });
});

describe('SettingsScreen restart notice edge cases', () => {
  const RESTART = /the next time Wanderly starts/;
  const RESTART_UR = /اگلی بار Wanderly شروع ہونے پر/;

  beforeEach(() => {
    // The app was launched left to right.
    jest.replaceProperty(I18nManager, 'isRTL', false);
    jest.spyOn(I18nManager, 'allowRTL').mockImplementation(() => undefined);
    jest.spyOn(I18nManager, 'forceRTL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('switching to Urdu and back to English before restarting removes the restart notice', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<SettingsScreen />, { initialLanguage: 'en' });

    await user.press(await screen.findByRole('radio', { name: 'اردو' }));
    expect(await screen.findByText(RESTART_UR)).toBeOnTheScreen();

    await user.press(screen.getByRole('radio', { name: 'English' }));

    await screen.findByText('Appearance');
    expect(screen.queryByText(RESTART)).not.toBeOnTheScreen();
    expect(I18nManager.forceRTL).toHaveBeenLastCalledWith(false);
  });

  it('switching between two left-to-right languages never asks for a restart', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<SettingsScreen />, { initialLanguage: 'en' });

    await user.press(await screen.findByRole('radio', { name: 'Español' }));
    await screen.findByText('Apariencia');

    expect(screen.queryByText(/la próxima vez que se abra Wanderly/)).not.toBeOnTheScreen();
    expect(I18nManager.forceRTL).not.toHaveBeenCalledWith(true);
  });
});
