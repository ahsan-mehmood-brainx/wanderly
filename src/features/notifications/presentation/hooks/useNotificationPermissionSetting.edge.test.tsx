import { screen, userEvent, waitFor, within } from '@testing-library/react-native';

import { ok } from '@/core/result';
import { DEFAULT_PREFERENCES } from '@/features/preferences/domain/Preferences';
import { SettingsScreen } from '@/features/preferences/presentation/screens/SettingsScreen';
import { MockPreferencesRepository } from '@/testing/MockPreferencesRepository';
import { FakeNotificationService } from '@/testing/notificationFixtures';
import { renderWithProviders } from '@/testing/renderWithProviders';

import { type NotificationPermission } from '../../domain/Notification';
import { type ReconcileInput } from '../../domain/usecases/notificationUseCases';

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const remindersOn = () =>
  new MockPreferencesRepository({
    ...DEFAULT_PREFERENCES,
    notifications: { tripReminders: true, budgetAlerts: false },
  });

function reconcileSpy() {
  return jest.fn(async (_input: ReconcileInput) => ok({ scheduled: 0, cancelled: 0, presented: 0 }));
}

describe('notification permission in Settings, edge cases', () => {
  it('AC4 pressing Allow twice while the system prompt is open asks the OS once', async () => {
    const user = userEvent.setup();
    const notifications = new FakeNotificationService();
    notifications.permission = 'denied';
    const answer = deferred<NotificationPermission>();
    notifications.requestPermission.mockImplementationOnce(() => answer.promise);
    await renderWithProviders(<SettingsScreen />, {
      dependencies: {
        notificationService: notifications,
        preferencesRepository: remindersOn(),
        reconcileNotifications: { execute: reconcileSpy() },
      },
    });

    const allow = within(await screen.findByTestId('notification-access')).getByRole('button', { name: 'Allow' });
    await user.press(allow);
    await user.press(allow);
    answer.resolve('granted');

    await waitFor(() => expect(screen.queryByTestId('notification-access')).not.toBeOnTheScreen());
    expect(notifications.requestPermission).toHaveBeenCalledTimes(1);
  });

  it('AC4 a permission granted from Settings reconciles at once, so reminders that are on get scheduled', async () => {
    const user = userEvent.setup();
    const notifications = new FakeNotificationService();
    notifications.permission = 'denied';
    const reconcile = reconcileSpy();
    await renderWithProviders(<SettingsScreen />, {
      dependencies: {
        notificationService: notifications,
        preferencesRepository: remindersOn(),
        reconcileNotifications: { execute: reconcile },
      },
    });

    await user.press(within(await screen.findByTestId('notification-access')).getByRole('button', { name: 'Allow' }));

    await waitFor(() =>
      expect(reconcile).toHaveBeenCalledWith({
        trigger: 'settings',
        preferences: { notifications: { tripReminders: true, budgetAlerts: false }, language: 'system' },
      }),
    );
  });

  it('AC4 a prompt declined again starts no reconcile and keeps offering Allow', async () => {
    const user = userEvent.setup();
    const notifications = new FakeNotificationService();
    notifications.permission = 'denied';
    notifications.answerPromptWith = 'denied';
    const reconcile = reconcileSpy();
    await renderWithProviders(<SettingsScreen />, {
      dependencies: {
        notificationService: notifications,
        preferencesRepository: remindersOn(),
        reconcileNotifications: { execute: reconcile },
      },
    });

    await user.press(within(await screen.findByTestId('notification-access')).getByRole('button', { name: 'Allow' }));

    await waitFor(() => expect(notifications.requestPermission).toHaveBeenCalledTimes(1));
    expect(within(screen.getByTestId('notification-access')).getByRole('button', { name: 'Allow' })).toBeOnTheScreen();
    expect(reconcile).not.toHaveBeenCalledWith(expect.objectContaining({ trigger: 'settings' }));
  });

  it('AC4 turning a switch on before the permission has been read still asks the OS once', async () => {
    const user = userEvent.setup();
    const notifications = new FakeNotificationService();
    const firstRead = deferred<NotificationPermission>();
    notifications.getPermission.mockImplementationOnce(() => firstRead.promise);
    await renderWithProviders(<SettingsScreen />, {
      dependencies: { notificationService: notifications, reconcileNotifications: { execute: reconcileSpy() } },
    });

    await user.press(await screen.findByRole('switch', { name: 'Trip reminders' }));
    firstRead.resolve('undetermined');

    await waitFor(() => expect(notifications.requestPermission).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('switch', { name: 'Trip reminders' })).toBeChecked();
  });
});
