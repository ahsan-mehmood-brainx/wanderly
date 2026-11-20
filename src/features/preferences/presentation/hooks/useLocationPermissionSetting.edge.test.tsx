import { act, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { captureAppState } from '@/testing/captureAppState';
import { FakeLocationService } from '@/testing/FakeLocationService';
import { renderWithProviders } from '@/testing/renderWithProviders';

import { type LocationPermission } from '@/features/weather/domain/repositories';

import { SettingsScreen } from '../screens/SettingsScreen';

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe('Settings location permission edge cases', () => {
  let appState: ReturnType<typeof captureAppState>;

  beforeEach(() => {
    appState = captureAppState();
  });

  afterEach(() => {
    appState.restore();
    jest.restoreAllMocks();
  });

  it('reads the permission again when the app returns from system settings', async () => {
    const location = new FakeLocationService();
    location.permission = 'blocked';
    await renderWithProviders(<SettingsScreen />, { dependencies: { mapLocationService: location } });
    expect(await screen.findByText('Turned off in system settings')).toBeOnTheScreen();

    location.permission = 'granted';
    await appState.foreground();

    expect(await screen.findByText('Allowed')).toBeOnTheScreen();
    // Still the way to change it, now to revoke access.
    expect(screen.getByRole('button', { name: 'Open Settings' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Allow' })).not.toBeOnTheScreen();
  });

  it('does not re-read the permission when the app only goes to the background', async () => {
    const location = new FakeLocationService();
    const getPermission = jest.spyOn(location, 'getPermission');
    await renderWithProviders(<SettingsScreen />, { dependencies: { mapLocationService: location } });
    await screen.findByText('Not asked yet');
    const calls = getPermission.mock.calls.length;

    await appState.send('inactive', 'background');

    expect(getPermission).toHaveBeenCalledTimes(calls);
  });

  it('asks the system once when Allow is tapped twice while the prompt is open', async () => {
    const user = userEvent.setup();
    const location = new FakeLocationService();
    const answer = deferred<LocationPermission>();
    location.requestPermission.mockImplementationOnce(() => answer.promise);
    await renderWithProviders(<SettingsScreen />, { dependencies: { mapLocationService: location } });

    const allow = await screen.findByRole('button', { name: 'Allow' });
    await user.press(allow);
    await user.press(allow);
    await act(async () => answer.resolve('granted'));

    expect(location.requestPermission).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Allowed')).toBeOnTheScreen();
  });

  it('offers Allow again after the traveller declines at the prompt but can still be asked', async () => {
    const user = userEvent.setup();
    const location = new FakeLocationService();
    location.answerPromptWith = 'denied';
    await renderWithProviders(<SettingsScreen />, { dependencies: { mapLocationService: location } });

    await user.press(await screen.findByRole('button', { name: 'Allow' }));

    expect(await screen.findByText('Not allowed')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Allow' })).toBeEnabled();
  });

  it('switches to Open Settings when the prompt answer blocks further requests', async () => {
    const user = userEvent.setup();
    const location = new FakeLocationService();
    location.answerPromptWith = 'blocked';
    await renderWithProviders(<SettingsScreen />, { dependencies: { mapLocationService: location } });

    await user.press(await screen.findByRole('button', { name: 'Allow' }));

    expect(await screen.findByRole('button', { name: 'Open Settings' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Allow' })).not.toBeOnTheScreen();
  });

  it('an older permission read that finishes after the prompt answer does not overwrite it', async () => {
    const user = userEvent.setup();
    const location = new FakeLocationService();
    await renderWithProviders(<SettingsScreen />, { dependencies: { mapLocationService: location } });
    await screen.findByText('Not asked yet');

    // A foreground re-check starts and is slow; meanwhile the traveller allows access.
    const slowRead = deferred<LocationPermission>();
    jest.spyOn(location, 'getPermission').mockImplementationOnce(() => slowRead.promise);
    await appState.foreground();
    await user.press(screen.getByRole('button', { name: 'Allow' }));
    expect(await screen.findByText('Allowed')).toBeOnTheScreen();

    await act(async () => slowRead.resolve('undetermined'));

    expect(screen.getByText('Allowed')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Allow' })).not.toBeOnTheScreen();
  });

  it('only logs when the system settings cannot be opened', async () => {
    const user = userEvent.setup();
    jest.spyOn(Linking, 'openSettings').mockRejectedValue(new Error('no settings app'));
    const location = new FakeLocationService();
    location.permission = 'blocked';
    const { dependencies } = await renderWithProviders(<SettingsScreen />, {
      dependencies: { mapLocationService: location },
    });

    await user.press(await screen.findByRole('button', { name: 'Open Settings' }));

    await waitFor(() =>
      expect(dependencies.logger.warn).toHaveBeenCalledWith('Could not open the system settings', expect.anything()),
    );
    expect(screen.getByRole('button', { name: 'Open Settings' })).toBeOnTheScreen();
  });

  it('a permission read that finishes after leaving Settings is ignored', async () => {
    const location = new FakeLocationService();
    const slowRead = deferred<LocationPermission>();
    jest.spyOn(location, 'getPermission').mockImplementationOnce(() => slowRead.promise);
    const errors = jest.spyOn(console, 'error');
    await renderWithProviders(<SettingsScreen />, { dependencies: { mapLocationService: location } });

    screen.unmount();
    await act(async () => slowRead.resolve('granted'));

    expect(errors).not.toHaveBeenCalled();
  });
});
