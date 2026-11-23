import { act, renderHook } from '@testing-library/react-native';
import { type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { Provider as ReduxProvider } from 'react-redux';

import { DependenciesProvider } from '@/core/di/DependenciesProvider';
import { Subject } from '@/core/events/Subject';
import { createI18n } from '@/core/i18n/createI18n';
import { ok } from '@/core/result';
import { type LocalChangeLog } from '@/core/sync/LocalChange';
import { updatePreferences } from '@/features/preferences/presentation/state/preferencesSlice';
import { captureAppState } from '@/testing/captureAppState';
import { createTestStore } from '@/testing/createTestStore';
import { createTestDependencies } from '@/testing/testDependencies';

import { type ReconcileInput } from '../../domain/usecases/notificationUseCases';
import { RECONCILE_DEBOUNCE_MS, useNotificationLifecycle } from './useNotificationLifecycle';

function setup() {
  const changes = new Subject<void>();
  const localChangeLog: LocalChangeLog = { record: async () => undefined, recorded: changes };
  const reconcile = jest.fn(async (_input: ReconcileInput) => ok({ scheduled: 0, cancelled: 0, presented: 0 }));
  const clear = jest.fn(async () => ok(undefined));
  const dependencies = createTestDependencies({
    localChangeLog,
    reconcileNotifications: { execute: reconcile },
    clearNotifications: { execute: clear },
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
  return { changes, reconcile, clear, store, wrapper };
}

const triggers = (reconcile: jest.Mock) => reconcile.mock.calls.map(([input]) => (input as ReconcileInput).trigger);

describe('useNotificationLifecycle', () => {
  let appState: ReturnType<typeof captureAppState>;

  beforeEach(() => {
    jest.useFakeTimers();
    appState = captureAppState();
  });

  afterEach(() => {
    appState.restore();
    jest.useRealTimers();
  });

  it('AC2 reconciles once when someone signs in or the app launches signed in', async () => {
    const { reconcile, wrapper } = setup();

    await renderHook(() => useNotificationLifecycle(), { wrapper });

    expect(triggers(reconcile)).toEqual(['launch']);
  });

  it('AC2 reconciles once, 300 ms after a burst of local changes', async () => {
    const { changes, reconcile, wrapper } = setup();
    await renderHook(() => useNotificationLifecycle(), { wrapper });

    act(() => {
      changes.emit();
      changes.emit();
      changes.emit();
    });
    await act(async () => {
      jest.advanceTimersByTime(RECONCILE_DEBOUNCE_MS - 1);
    });
    expect(triggers(reconcile)).toEqual(['launch']);

    await act(async () => {
      jest.advanceTimersByTime(1);
    });

    expect(RECONCILE_DEBOUNCE_MS).toBe(300);
    expect(triggers(reconcile)).toEqual(['launch', 'change']);
  });

  it('AC8 reconciles on return to the foreground, not when going to the background', async () => {
    const { reconcile, wrapper } = setup();
    await renderHook(() => useNotificationLifecycle(), { wrapper });

    await appState.send('inactive', 'background');
    expect(triggers(reconcile)).toEqual(['launch']);

    await appState.foreground();

    expect(triggers(reconcile)).toEqual(['launch', 'foreground']);
  });

  it('AC6 reconciles when a notification switch changes', async () => {
    const { reconcile, store, wrapper } = setup();
    await renderHook(() => useNotificationLifecycle(), { wrapper });
    const before = reconcile.mock.calls.length;

    await act(async () => {
      await store.dispatch(updatePreferences({ notifications: { tripReminders: true } }));
      jest.advanceTimersByTime(RECONCILE_DEBOUNCE_MS);
    });

    expect(reconcile.mock.calls.length).toBe(before + 1);
    expect(triggers(reconcile).at(-1)).toBe('settings');
  });

  it('AC2 reconciles when the language changes, so the text follows it', async () => {
    const { reconcile, store, wrapper } = setup();
    await renderHook(() => useNotificationLifecycle(), { wrapper });
    const before = reconcile.mock.calls.length;

    await act(async () => {
      await store.dispatch(updatePreferences({ language: 'es' }));
      jest.advanceTimersByTime(RECONCILE_DEBOUNCE_MS);
    });

    expect(reconcile.mock.calls.length).toBe(before + 1);
  });

  it('AC2 does not reconcile for an unrelated preference', async () => {
    const { reconcile, store, wrapper } = setup();
    await renderHook(() => useNotificationLifecycle(), { wrapper });
    const before = reconcile.mock.calls.length;

    await act(async () => {
      await store.dispatch(updatePreferences({ theme: 'dark' }));
      jest.advanceTimersByTime(RECONCILE_DEBOUNCE_MS);
    });

    expect(before).toBe(1);
    expect(reconcile.mock.calls.length).toBe(before);
  });

  it('AC3 leaves clearing to the root: unmounting alone (still signed in) clears nothing', async () => {
    const { clear, reconcile, wrapper } = setup();
    const { unmount } = await renderHook(() => useNotificationLifecycle(), { wrapper });
    expect(reconcile).toHaveBeenCalled();

    await unmount();

    expect(clear).not.toHaveBeenCalled();
  });

  it('AC3 stops listening after unmount: a pending or later change starts no reconcile', async () => {
    const { changes, reconcile, wrapper } = setup();
    const { unmount } = await renderHook(() => useNotificationLifecycle(), { wrapper });
    expect(reconcile).toHaveBeenCalledTimes(1);

    act(() => changes.emit());
    await unmount();
    act(() => changes.emit());
    await act(async () => {
      jest.advanceTimersByTime(RECONCILE_DEBOUNCE_MS * 2);
    });
    await appState.foreground();

    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(changes.listenerCount).toBe(0);
  });
});
