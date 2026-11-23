import { act, renderHook } from '@testing-library/react-native';
import { type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { Provider as ReduxProvider } from 'react-redux';

import { DependenciesProvider } from '@/core/di/DependenciesProvider';
import { AppError } from '@/core/errors/AppError';
import { Subject } from '@/core/events/Subject';
import { createI18n } from '@/core/i18n/createI18n';
import { err, ok, type Result } from '@/core/result';
import { type LocalChangeLog } from '@/core/sync/LocalChange';
import { type PreferenceChanges } from '@/features/preferences/domain/Preferences';
import { updatePreferences } from '@/features/preferences/presentation/state/preferencesSlice';
import { captureAppState } from '@/testing/captureAppState';
import { createTestStore } from '@/testing/createTestStore';
import { createTestDependencies } from '@/testing/testDependencies';

import { type ReconcileInput } from '../../domain/usecases/notificationUseCases';
import { RECONCILE_DEBOUNCE_MS, useNotificationLifecycle } from './useNotificationLifecycle';

/** A preferences save that settles only when the test says so. */
function slowSave() {
  let settle: (result: Result<void, AppError>) => void = () => undefined;
  const execute = jest.fn(
    (_changes: PreferenceChanges) =>
      new Promise<Result<void, AppError>>((resolve) => {
        settle = resolve;
      }),
  );
  return { execute, settle: (result: Result<void, AppError>) => settle(result) };
}

function setup() {
  const localChangeLog: LocalChangeLog = { record: async () => undefined, recorded: new Subject<void>() };
  const reconcile = jest.fn(async (_input: ReconcileInput) => ok({ scheduled: 0, cancelled: 0, presented: 0 }));
  const save = slowSave();
  const dependencies = createTestDependencies({
    localChangeLog,
    reconcileNotifications: { execute: reconcile },
    clearNotifications: { execute: jest.fn(async () => ok(undefined)) },
    savePreferences: { execute: save.execute },
  });
  const store = createTestStore(dependencies);
  const i18n = createI18n('en');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <DependenciesProvider dependencies={dependencies}>
      <ReduxProvider store={store}>
        <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
      </ReduxProvider>
    </DependenciesProvider>
  );
  return { reconcile, save, store, wrapper };
}

const lastInput = (reconcile: jest.Mock) => reconcile.mock.calls.at(-1)?.[0] as ReconcileInput | undefined;

describe('useNotificationLifecycle preferences', () => {
  let appState: ReturnType<typeof captureAppState>;

  beforeEach(() => {
    jest.useFakeTimers();
    appState = captureAppState();
  });

  afterEach(() => {
    appState.restore();
    jest.useRealTimers();
  });

  it('AC2 launches with the preferences the app shows', async () => {
    const { reconcile, store, wrapper } = setup();
    const { notifications, language } = store.getState().preferences.values;

    await renderHook(() => useNotificationLifecycle(), { wrapper });

    expect(lastInput(reconcile)).toEqual({ trigger: 'launch', preferences: { notifications, language } });
  });

  it('AC6 a switch change reconciles with the new value while the save is still running past the debounce', async () => {
    const { reconcile, save, store, wrapper } = setup();
    await renderHook(() => useNotificationLifecycle(), { wrapper });
    const before = store.getState().preferences.values.notifications;

    act(() => {
      void store.dispatch(updatePreferences({ notifications: { tripReminders: !before.tripReminders } }));
    });
    await act(async () => {
      jest.advanceTimersByTime(RECONCILE_DEBOUNCE_MS * 5);
    });

    expect(save.execute).toHaveBeenCalledTimes(1);
    expect(lastInput(reconcile)).toEqual({
      trigger: 'settings',
      preferences: {
        notifications: { ...before, tripReminders: !before.tripReminders },
        language: store.getState().preferences.values.language,
      },
    });

    await act(async () => save.settle(ok(undefined)));
  });

  it('AC6 a language change reconciles in the new language even when its save fails', async () => {
    const { reconcile, save, store, wrapper } = setup();
    await renderHook(() => useNotificationLifecycle(), { wrapper });

    await act(async () => {
      const pending = store.dispatch(updatePreferences({ language: 'es' }));
      save.settle(err(new AppError('storage', 'disk full')));
      await pending;
      jest.advanceTimersByTime(RECONCILE_DEBOUNCE_MS);
    });

    expect(store.getState().preferences.saveError).toBe('storage');
    expect(lastInput(reconcile)?.preferences?.language).toBe('es');
  });
});
