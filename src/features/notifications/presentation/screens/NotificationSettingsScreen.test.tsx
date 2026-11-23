import { screen, userEvent, waitFor, within } from '@testing-library/react-native';

import { type AppDependencies } from '@/core/di/AppDependencies';
import { AppError } from '@/core/errors/AppError';
import { ok } from '@/core/result';
import { formatLocalTime } from '@/features/itinerary/domain/localTime';
import { formatTime } from '@/features/itinerary/presentation/format';
import { updatePreferences } from '@/features/preferences/presentation/state/preferencesSlice';
import { InMemoryKeyValueStore } from '@/testing/InMemoryKeyValueStore';
import { MockPreferencesRepository } from '@/testing/MockPreferencesRepository';
import { notificationSettings } from '@/testing/notificationFixtures';
import { renderWithProviders } from '@/testing/renderWithProviders';

import { NOTIFICATION_SETTINGS_STORAGE_KEY } from '../../data/StorageNotificationRepository';
import { REMINDER_HOUR } from '../../domain/reminderPlanning';
import { type ReconcileInput } from '../../domain/usecases/notificationUseCases';
import { NotificationSettingsScreen } from './NotificationSettingsScreen';

const UPCOMING = /upcoming trip/i;
const ACTIVITY = /activit/i;
const BUDGET = /budget/i;
const TRIP_START = /trip start/i;

async function group(name: RegExp) {
  return within(await screen.findByRole('radiogroup', { name }));
}

async function optionLabels(name: RegExp): Promise<string[]> {
  return (await group(name)).getAllByRole('radio').map((radio) => String(radio.props.accessibilityLabel));
}

function expectLabels(labels: readonly string[], patterns: readonly RegExp[]) {
  expect(labels).toHaveLength(patterns.length);
  patterns.forEach((pattern, index) => expect(labels[index]).toMatch(pattern));
}

async function checkedLabel(name: RegExp): Promise<string> {
  const checked = (await group(name)).getAllByRole('radio', { checked: true });
  expect(checked).toHaveLength(1);
  return String(checked[0]?.props.accessibilityLabel);
}

async function storedSettings(dependencies: AppDependencies) {
  const result = await dependencies.notificationRepository.loadSettings();
  if (!result.ok) throw result.error;
  return result.value;
}

async function setup(dependencies: Partial<AppDependencies> = {}) {
  const keyValueStore = new InMemoryKeyValueStore();
  const reconcile = jest.fn(async (_input: ReconcileInput) => ok({ scheduled: 0, cancelled: 0, presented: 0 }));
  const rendered = await renderWithProviders(<NotificationSettingsScreen />, {
    dependencies: { keyValueStore, reconcileNotifications: { execute: reconcile }, ...dependencies },
  });
  return { ...rendered, keyValueStore, reconcile, user: userEvent.setup() };
}

describe('NotificationSettingsScreen', () => {
  it('AC6 offers Off, 1, 2, 3 or 7 days before a trip, 1 day selected by default', async () => {
    await setup();

    expectLabels(await optionLabels(UPCOMING), [/^off$/i, /1 day/i, /2 days/i, /3 days/i, /7 days|1 week/i]);
    expect(await checkedLabel(UPCOMING)).toMatch(/1 day/i);
  });

  it('AC6 offers Off, 15 min, 30 min, 1 h, 2 h or 1 day before an activity, 2 hours selected by default', async () => {
    await setup();

    expectLabels(await optionLabels(ACTIVITY), [/^off$/i, /15 min/i, /30 min/i, /1 hour/i, /2 hours/i, /1 day/i]);
    expect(await checkedLabel(ACTIVITY)).toMatch(/2 hours/i);
  });

  it('AC6 offers budget thresholds of 50, 75, 80, 90 and 100 percent, 80% selected by default', async () => {
    await setup();

    expectLabels(await optionLabels(BUDGET), [/50\s?%/, /75\s?%/, /80\s?%/, /90\s?%/, /100\s?%/]);
    expect(await checkedLabel(BUDGET)).toMatch(/80\s?%/);
  });

  it('AC6 has the trip start reminder on by default', async () => {
    await setup();

    expect(await screen.findByRole('switch', { name: TRIP_START })).toBeChecked();
  });

  it('AC6 saves a choice under notifications.settings.v1 and shows it after a restart', async () => {
    const { user, keyValueStore, dependencies } = await setup();

    await user.press((await group(UPCOMING)).getByRole('radio', { name: /3 days/i }));

    expect(await checkedLabel(UPCOMING)).toMatch(/3 days/i);
    await waitFor(async () => expect((await storedSettings(dependencies)).upcomingTripDaysBefore).toBe(3));
    expect(keyValueStore.data.has(NOTIFICATION_SETTINGS_STORAGE_KEY)).toBe(true);

    await screen.unmount();
    await setup({ keyValueStore });

    expect(await checkedLabel(UPCOMING)).toMatch(/3 days/i);
  });

  it('AC6 turning the activity reminder off saves it as off', async () => {
    const { user, dependencies } = await setup();

    await user.press((await group(ACTIVITY)).getByRole('radio', { name: /^off$/i }));

    await waitFor(async () => expect((await storedSettings(dependencies)).activityMinutesBefore).toBeNull());
    expect(await checkedLabel(ACTIVITY)).toMatch(/^off$/i);
  });

  it('AC6 turning the trip start reminder off saves it', async () => {
    const { user, dependencies } = await setup();

    await user.press(await screen.findByRole('switch', { name: TRIP_START }));

    expect(screen.getByRole('switch', { name: TRIP_START })).not.toBeChecked();
    await waitFor(async () => expect((await storedSettings(dependencies)).tripStartReminder).toBe(false));
  });

  it('AC6 saving a threshold keeps the other choices', async () => {
    const { user, dependencies } = await setup();

    await user.press((await group(BUDGET)).getByRole('radio', { name: /90\s?%/ }));

    await waitFor(async () =>
      expect(await storedSettings(dependencies)).toEqual(notificationSettings({ budgetThresholdPercent: 90 })),
    );
  });

  it('AC6 a change reconciles so the new reminder times apply', async () => {
    const { user, reconcile, dependencies, store } = await setup();
    const { notifications, language } = store.getState().preferences.values;

    await user.press((await group(ACTIVITY)).getByRole('radio', { name: /15 min/i }));

    await waitFor(() =>
      expect(reconcile).toHaveBeenCalledWith({ trigger: 'settings', preferences: { notifications, language } }),
    );
    expect((await storedSettings(dependencies)).activityMinutesBefore).toBe(15);
  });

  it('AC6 a change reconciles with the switches the app shows, even when saving a switch failed', async () => {
    const preferencesRepository = new MockPreferencesRepository();
    const { user, reconcile, store } = await setup({ preferencesRepository });
    const stored = preferencesRepository.stored.notifications;
    preferencesRepository.saveError = new AppError('storage', 'disk full');
    await store.dispatch(updatePreferences({ notifications: { tripReminders: !stored.tripReminders } }));
    // The session keeps the change; storage still has the old value.
    expect(store.getState().preferences.values.notifications.tripReminders).toBe(!stored.tripReminders);
    expect(preferencesRepository.stored.notifications.tripReminders).toBe(stored.tripReminders);

    await user.press((await group(ACTIVITY)).getByRole('radio', { name: /15 min/i }));

    await waitFor(() =>
      expect(reconcile).toHaveBeenCalledWith({
        trigger: 'settings',
        preferences: expect.objectContaining({
          notifications: { ...stored, tripReminders: !stored.tripReminders },
        }),
      }),
    );
  });

  it('AC6 shows the reminder hour in the locale style, from the planner', async () => {
    await setup();

    const time = formatTime(formatLocalTime({ hour: REMINDER_HOUR, minute: 0 }), 'en');
    expect(await screen.findByText(`At ${time} on the first day`)).toBeOnTheScreen();
    expect(screen.getByText(new RegExp(`arrive at ${time}`))).toBeOnTheScreen();
  });

  it('AC6 shows choices saved earlier', async () => {
    const keyValueStore = new InMemoryKeyValueStore({
      [NOTIFICATION_SETTINGS_STORAGE_KEY]: JSON.stringify(
        notificationSettings({ upcomingTripDaysBefore: 7, tripStartReminder: false, activityMinutesBefore: 30 }),
      ),
    });
    await setup({ keyValueStore });

    expect(await checkedLabel(UPCOMING)).toMatch(/7 days|1 week/i);
    expect(await checkedLabel(ACTIVITY)).toMatch(/30 min/i);
    expect(screen.getByRole('switch', { name: TRIP_START })).not.toBeChecked();
  });

  it('AC10 is translated (Spanish)', async () => {
    await renderWithProviders(<NotificationSettingsScreen />, { initialLanguage: 'es' });

    expect(await screen.findAllByRole('radiogroup')).toHaveLength(3);
    expect(screen.getAllByRole('switch')).toHaveLength(1);
    for (const english of [/upcoming trip/i, /2 hours/i, /trip start/i, /^off$/i]) {
      expect(screen.queryByText(english)).not.toBeOnTheScreen();
    }
  });
});
