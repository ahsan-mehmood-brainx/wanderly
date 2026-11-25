import { screen, userEvent, waitFor, within } from '@testing-library/react-native';

import { type AppDependencies } from '@/core/di/AppDependencies';
import { ok } from '@/core/result';
import { InMemoryKeyValueStore } from '@/testing/InMemoryKeyValueStore';
import { renderWithProviders } from '@/testing/renderWithProviders';

import { NOTIFICATION_SETTINGS_STORAGE_KEY } from '../../data/StorageNotificationRepository';
import { type ReconcileInput } from '../../domain/usecases/notificationUseCases';
import { NotificationSettingsScreen } from './NotificationSettingsScreen';

const UPCOMING = /upcoming trip/i;
const BUDGET = /budget/i;
const SAVE_ERROR = /couldn't save this change/i;
const LOAD_ERROR = /couldn't load your reminder times/i;

async function group(name: RegExp) {
  return within(await screen.findByRole('radiogroup', { name }));
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

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function setup(keyValueStore = new InMemoryKeyValueStore()) {
  const reconcile = jest.fn(async (_input: ReconcileInput) => ok({ scheduled: 0, cancelled: 0, presented: 0 }));
  const rendered = await renderWithProviders(<NotificationSettingsScreen />, {
    dependencies: { keyValueStore, reconcileNotifications: { execute: reconcile } },
  });
  return { ...rendered, keyValueStore, reconcile, user: userEvent.setup() };
}

describe('NotificationSettingsScreen save and load failures', () => {
  it('AC6 a failed save shows an error, puts back the stored choice and does not reconcile', async () => {
    const keyValueStore = new InMemoryKeyValueStore();
    jest.spyOn(keyValueStore, 'setItem').mockRejectedValue(new Error('disk full'));
    const { user, reconcile } = await setup(keyValueStore);

    await user.press((await group(UPCOMING)).getByRole('radio', { name: /3 days/i }));

    expect(await screen.findByText(SAVE_ERROR)).toBeOnTheScreen();
    await waitFor(async () => expect(await checkedLabel(UPCOMING)).toMatch(/1 day/i));
    expect(reconcile).not.toHaveBeenCalled();
  });

  it('AC6 dismissing the save error hides it, and the next successful change keeps it hidden', async () => {
    const keyValueStore = new InMemoryKeyValueStore();
    jest.spyOn(keyValueStore, 'setItem').mockRejectedValueOnce(new Error('disk full'));
    const { user, dependencies } = await setup(keyValueStore);

    await user.press((await group(UPCOMING)).getByRole('radio', { name: /3 days/i }));
    await user.press(await screen.findByRole('button', { name: /dismiss/i }));
    expect(screen.queryByText(SAVE_ERROR)).not.toBeOnTheScreen();

    await user.press((await group(UPCOMING)).getByRole('radio', { name: /2 days/i }));

    await waitFor(async () => expect((await storedSettings(dependencies)).upcomingTripDaysBefore).toBe(2));
    expect(screen.queryByText(SAVE_ERROR)).not.toBeOnTheScreen();
  });

  it('AC6 after a failed change, a quicker second change that saved is still shown as chosen', async () => {
    const keyValueStore = new InMemoryKeyValueStore();
    const gate = deferred();
    const realSetItem = keyValueStore.setItem.bind(keyValueStore);
    jest.spyOn(keyValueStore, 'setItem').mockImplementation(async (key, value) => {
      if (key === NOTIFICATION_SETTINGS_STORAGE_KEY && !keyValueStore.data.has('first-save-failed')) {
        keyValueStore.data.set('first-save-failed', 'yes');
        await gate.promise;
        throw new Error('disk full');
      }
      return realSetItem(key, value);
    });
    const { user, dependencies } = await setup(keyValueStore);

    await user.press((await group(UPCOMING)).getByRole('radio', { name: /3 days/i }));
    await user.press((await group(BUDGET)).getByRole('radio', { name: /90\s?%/ }));
    gate.resolve();

    await waitFor(async () => expect((await storedSettings(dependencies)).budgetThresholdPercent).toBe(90));
    expect(await screen.findByText(SAVE_ERROR)).toBeOnTheScreen();
    await waitFor(async () => expect(await checkedLabel(BUDGET)).toMatch(/90\s?%/));
    expect(await checkedLabel(UPCOMING)).toMatch(/1 day/i);
  });

  it('AC6 stored settings that cannot be read show the defaults with a warning, and choices still save', async () => {
    const keyValueStore = new InMemoryKeyValueStore();
    const realGetItem = keyValueStore.getItem.bind(keyValueStore);
    let failedOnce = false;
    jest.spyOn(keyValueStore, 'getItem').mockImplementation(async (key) => {
      if (key === NOTIFICATION_SETTINGS_STORAGE_KEY && !failedOnce) {
        failedOnce = true;
        throw new Error('locked');
      }
      return realGetItem(key);
    });
    const { user, dependencies } = await setup(keyValueStore);

    expect(await screen.findByText(LOAD_ERROR)).toBeOnTheScreen();
    expect(await checkedLabel(UPCOMING)).toMatch(/1 day/i);

    await user.press((await group(UPCOMING)).getByRole('radio', { name: /^off$/i }));

    await waitFor(async () => expect((await storedSettings(dependencies)).upcomingTripDaysBefore).toBeNull());
  });
});
