import { screen, userEvent, waitFor } from '@testing-library/react-native';
import Constants from 'expo-constants';
import { Stack } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { Alert, I18nManager, Linking } from 'react-native';

import AboutRoute from '@/app/(app)/(tabs)/profile/about';
import PrivacyRoute from '@/app/(app)/(tabs)/profile/privacy';
import SettingsRoute from '@/app/(app)/(tabs)/profile/settings';
import { AppProviders } from '@/bootstrap/AppProviders';
import { type AppDependencies } from '@/core/di/AppDependencies';
import { AppError } from '@/core/errors/AppError';
import { createI18n } from '@/core/i18n/createI18n';
import { err, ok } from '@/core/result';
import { restoreSession } from '@/features/auth/presentation/state/authSlice';
import { InMemorySessionRepository, testSession } from '@/testing/authFixtures';
import { createTestStore } from '@/testing/createTestStore';
import { FakeLocationService } from '@/testing/FakeLocationService';
import { InMemoryKeyValueStore } from '@/testing/InMemoryKeyValueStore';
import { layoutDirectionAt } from '@/testing/layoutDirection';
import { MockPreferencesRepository } from '@/testing/MockPreferencesRepository';
import { renderWithProviders } from '@/testing/renderWithProviders';
import { createTestDependencies } from '@/testing/testDependencies';

import { DEFAULT_PREFERENCES, type Preferences } from '../../domain/Preferences';
import { type PreferencesRepository } from '../../domain/PreferencesRepository';
import { SettingsScreen } from './SettingsScreen';

const URDU_SCRIPT = /[؀-ۿ]/;

async function storedPreferences(repository: PreferencesRepository): Promise<Preferences> {
  const result = await repository.load();
  if (!result.ok) throw result.error;
  return result.value;
}

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
      ok({ ...DEFAULT_PREFERENCES, theme: 'dark' }),
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

  describe('language and layout direction', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('TC-01 offers the device language, English, Spanish and Urdu', async () => {
      await renderWithProviders(<SettingsScreen />);

      await screen.findByRole('radio', { name: 'Device language' });
      const languages = ['Device language', 'English', 'Español', 'اردو'];
      const offered = screen
        .getAllByRole('radio')
        .map((radio) => String(radio.props.accessibilityLabel))
        .filter((label) => languages.includes(label));
      expect(offered).toEqual(languages);
    });

    it('TC-01 switches to Urdu immediately, lays the screen out right to left and saves the choice', async () => {
      const user = userEvent.setup();
      const { dependencies } = await renderWithProviders(<SettingsScreen />);

      await user.press(await screen.findByRole('radio', { name: 'اردو' }));

      await waitFor(() => expect(screen.queryByText('Appearance')).not.toBeOnTheScreen());
      expect(screen.getAllByRole('header', { name: URDU_SCRIPT }).length).toBeGreaterThan(0);
      expect(screen.getByRole('radio', { name: 'اردو' })).toBeChecked();
      expect(layoutDirectionAt(screen.getByRole('radio', { name: 'اردو' }))).toBe('rtl');
      expect((await storedPreferences(dependencies.preferencesRepository)).language).toBe('ur');
    });

    it('TC-02 asks for a restart when the native layout direction no longer matches the language', async () => {
      jest.replaceProperty(I18nManager, 'isRTL', true);
      jest.spyOn(I18nManager, 'allowRTL').mockImplementation(() => undefined);
      jest.spyOn(I18nManager, 'forceRTL').mockImplementation(() => undefined);
      const user = userEvent.setup();
      await renderWithProviders(<SettingsScreen />, {
        dependencies: {
          preferencesRepository: new MockPreferencesRepository({ ...DEFAULT_PREFERENCES, language: 'ur' }),
        },
      });

      await user.press(await screen.findByRole('radio', { name: 'English' }));

      expect(await screen.findByText(/the next time Wanderly starts/)).toBeOnTheScreen();
      expect(I18nManager.forceRTL).toHaveBeenCalledWith(false);
    });

    it('TC-02 shows no restart notice while the native layout matches the language', async () => {
      jest.replaceProperty(I18nManager, 'isRTL', false);
      jest.spyOn(I18nManager, 'allowRTL').mockImplementation(() => undefined);
      jest.spyOn(I18nManager, 'forceRTL').mockImplementation(() => undefined);
      const user = userEvent.setup();
      await renderWithProviders(<SettingsScreen />);

      await user.press(await screen.findByRole('radio', { name: 'English' }));

      await screen.findByRole('radio', { name: 'English', checked: true });
      expect(screen.queryByText(/the next time Wanderly starts/)).not.toBeOnTheScreen();
      expect(I18nManager.forceRTL).toHaveBeenCalledWith(false);
    });
  });

  describe('currency', () => {
    it('TC-06 starts on the device region currency', async () => {
      await renderWithProviders(<SettingsScreen />);

      expect(await screen.findByRole('button', { name: /Currency/ })).toHaveTextContent(/Device region/);
    });

    it('TC-06 offers the device region and every trip currency, and saves the chosen code', async () => {
      const user = userEvent.setup();
      const { dependencies } = await renderWithProviders(<SettingsScreen />);

      await user.press(await screen.findByRole('button', { name: /Currency/ }));
      expect(await screen.findByText('Device region')).toBeOnTheScreen();
      for (const code of ['USD', 'EUR', 'GBP', 'PKR', 'JPY', 'ZAR']) {
        expect(screen.getByText(code)).toBeOnTheScreen();
      }
      await user.press(screen.getByText('EUR'));

      await waitFor(async () =>
        expect((await storedPreferences(dependencies.preferencesRepository)).currency).toBe('EUR'),
      );
      expect(await screen.findByRole('button', { name: /Currency/ })).toHaveTextContent(/EUR/);
    });

    it('TC-06 goes back to the device region currency', async () => {
      const user = userEvent.setup();
      const repository = new MockPreferencesRepository({ ...DEFAULT_PREFERENCES, currency: 'GBP' });
      await renderWithProviders(<SettingsScreen />, { dependencies: { preferencesRepository: repository } });

      await user.press(await screen.findByRole('button', { name: /Currency/ }));
      await user.press(await screen.findByText('Device region'));

      await waitFor(() => expect(repository.stored.currency).toBe('system'));
    });
  });

  describe('notifications', () => {
    it('TC-07 offers trip reminder and budget alert switches, off by default, and says nothing is sent yet', async () => {
      await renderWithProviders(<SettingsScreen />);

      expect(await screen.findByRole('switch', { name: 'Trip reminders' })).not.toBeChecked();
      expect(screen.getByRole('switch', { name: 'Budget alerts' })).not.toBeChecked();
      expect(screen.getByText(/doesn.t send notifications yet/i)).toBeOnTheScreen();
    });

    it('TC-07 saves a switch and keeps it after a restart', async () => {
      const user = userEvent.setup();
      const keyValueStore = new InMemoryKeyValueStore();
      const { dependencies } = await renderWithProviders(<SettingsScreen />, { dependencies: { keyValueStore } });

      await user.press(await screen.findByRole('switch', { name: 'Trip reminders' }));

      expect(screen.getByRole('switch', { name: 'Trip reminders' })).toBeChecked();
      await waitFor(async () =>
        expect((await storedPreferences(dependencies.preferencesRepository)).notifications).toEqual({
          tripReminders: true,
          budgetAlerts: false,
        }),
      );

      await screen.unmount();
      await renderWithProviders(<SettingsScreen />, { dependencies: { keyValueStore } });

      expect(await screen.findByRole('switch', { name: 'Trip reminders' })).toBeChecked();
      expect(screen.getByRole('switch', { name: 'Budget alerts' })).not.toBeChecked();
    });
  });

  describe('location', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('TC-07 offers to allow location access before it was asked for', async () => {
      const user = userEvent.setup();
      const location = new FakeLocationService();
      await renderWithProviders(<SettingsScreen />, { dependencies: { mapLocationService: location } });

      await user.press(await screen.findByRole('button', { name: 'Allow' }));

      expect(location.requestPermission).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Allow' })).not.toBeOnTheScreen());
    });

    it('TC-07 sends a blocked permission to the system settings', async () => {
      const user = userEvent.setup();
      const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
      const location = new FakeLocationService();
      location.permission = 'blocked';
      await renderWithProviders(<SettingsScreen />, { dependencies: { mapLocationService: location } });

      await user.press(await screen.findByRole('button', { name: 'Open Settings' }));

      expect(openSettings).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('button', { name: 'Allow' })).not.toBeOnTheScreen();
    });

    it('TC-07 sends a granted permission to the system settings, where it can be revoked', async () => {
      const user = userEvent.setup();
      const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
      const location = new FakeLocationService();
      location.permission = 'granted';
      await renderWithProviders(<SettingsScreen />, { dependencies: { mapLocationService: location } });

      await user.press(await screen.findByRole('button', { name: 'Open Settings' }));

      expect(openSettings).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('button', { name: 'Allow' })).not.toBeOnTheScreen();
    });
  });

  describe('translations', () => {
    it('TC-04 renders the new sections through translations', async () => {
      await renderWithProviders(<SettingsScreen />, {
        dependencies: {
          preferencesRepository: new MockPreferencesRepository({ ...DEFAULT_PREFERENCES, language: 'es' }),
        },
      });

      expect(await screen.findByText('Apariencia')).toBeOnTheScreen();
      expect(screen.getAllByRole('switch')).toHaveLength(2);
      for (const english of ['Trip reminders', 'Budget alerts', 'Currency', 'Notifications', 'Privacy', 'Sign out']) {
        expect(screen.queryByText(english)).not.toBeOnTheScreen();
      }
    });
  });
});

describe('Settings navigation', () => {
  async function launch(overrides: Partial<AppDependencies> = {}) {
    const dependencies = createTestDependencies({
      sessionRepository: new InMemorySessionRepository(testSession()),
      ...overrides,
    });
    const store = createTestStore(dependencies);
    await store.dispatch(restoreSession());
    const container = { dependencies, store, i18n: createI18n('en') };

    const router = await renderRouter(
      {
        _layout: () => (
          <AppProviders container={container}>
            <Stack screenOptions={{ headerShown: false }} />
          </AppProviders>
        ),
        'profile/settings': SettingsRoute,
        'profile/privacy': PrivacyRoute,
        'profile/about': AboutRoute,
      },
      { initialUrl: '/profile/settings' },
    );
    return { router, store, dependencies, user: userEvent.setup() };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('TC-07 opens the privacy information', async () => {
    const { router, user } = await launch();

    await user.press(await screen.findByRole('button', { name: 'Privacy' }));

    await waitFor(() => expect(router.getPathname()).toBe('/profile/privacy'));
    expect(await screen.findByText(/OpenStreetMap/)).toBeOnTheScreen();
    expect(screen.getByText(/Open-Meteo/)).toBeOnTheScreen();
  });

  it('TC-07 opens About Wanderly with the app version', async () => {
    const { router, user } = await launch();
    const version = Constants.expoConfig?.version ?? '1.0.0';

    await user.press(await screen.findByRole('button', { name: /About/ }));

    await waitFor(() => expect(router.getPathname()).toBe('/profile/about'));
    expect(await screen.findByText(new RegExp(version.replace(/\./g, '\\.')))).toBeOnTheScreen();
  });

  it('TC-07 signs out only after confirmation', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { store, user } = await launch();
    expect(store.getState().auth.status).toBe('authenticated');

    await user.press(await screen.findByRole('button', { name: 'Sign out' }));

    expect(alert).toHaveBeenCalledTimes(1);
    expect(store.getState().auth.status).toBe('authenticated');
    const buttons = alert.mock.calls[0]?.[2] ?? [];
    const confirm = buttons.find((button) => button.style === 'destructive');
    confirm?.onPress?.();

    await waitFor(() => expect(store.getState().auth.status).toBe('unauthenticated'));
  });
});
