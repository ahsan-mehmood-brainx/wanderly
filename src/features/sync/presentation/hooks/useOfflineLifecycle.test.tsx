import { act, renderHook } from '@testing-library/react-native';
import { type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { AccessibilityInfo } from 'react-native';
import { Provider as ReduxProvider } from 'react-redux';

import { DependenciesProvider } from '@/core/di/DependenciesProvider';
import { createI18n } from '@/core/i18n/createI18n';
import { createTestStore } from '@/testing/createTestStore';
import { FakeConnectivityService, OFFLINE, ONLINE } from '@/testing/FakeConnectivityService';
import { createTestDependencies } from '@/testing/testDependencies';

import { useOfflineLifecycle } from './useOfflineLifecycle';

function setup() {
  const connectivity = new FakeConnectivityService(ONLINE);
  const dependencies = createTestDependencies({ connectivity });
  const start = jest.spyOn(dependencies.syncEngine, 'start');
  const store = createTestStore(dependencies);
  const i18n = createI18n('en');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <DependenciesProvider dependencies={dependencies}>
      <ReduxProvider store={store}>
        <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
      </ReduxProvider>
    </DependenciesProvider>
  );
  return { connectivity, start, wrapper };
}

describe('useOfflineLifecycle', () => {
  it('starts the sync engine and stops it on unmount', async () => {
    const { start, wrapper } = setup();
    const { unmount } = await renderHook(() => useOfflineLifecycle(), { wrapper });
    expect(start).toHaveBeenCalledTimes(1);
    const stop = start.mock.results[0]?.value as jest.Mock | (() => void);
    expect(typeof stop).toBe('function');
    await unmount();
  });

  it('announces going offline and coming back online once each', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const { connectivity, wrapper } = setup();
    await renderHook(() => useOfflineLifecycle(), { wrapper });

    act(() => connectivity.set(OFFLINE));
    act(() => connectivity.set(OFFLINE));
    act(() => connectivity.set(ONLINE));

    expect(announce.mock.calls).toEqual([
      ["You're offline. Your changes are saved on this device."],
      ["You're back online."],
    ]);
  });
});
