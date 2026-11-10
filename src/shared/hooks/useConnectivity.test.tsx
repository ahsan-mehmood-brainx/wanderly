import { act, renderHook } from '@testing-library/react-native';
import { type ReactNode } from 'react';

import { DependenciesProvider, useDependencies } from '@/core/di/DependenciesProvider';
import { FakeConnectivityService, OFFLINE } from '@/testing/FakeConnectivityService';
import { createTestDependencies } from '@/testing/testDependencies';

import { useConnectivity } from './useConnectivity';

describe('useConnectivity', () => {
  it('reflects the current state and re-renders on change', async () => {
    const connectivity = new FakeConnectivityService();
    const dependencies = createTestDependencies({ connectivity });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <DependenciesProvider dependencies={dependencies}>{children}</DependenciesProvider>
    );

    const { result } = await renderHook(() => useConnectivity(), { wrapper });
    expect(result.current).toMatchObject({ isConnected: true, isOffline: false });

    await act(() => connectivity.set(OFFLINE));

    expect(result.current).toMatchObject({ isConnected: false, isOffline: true, type: 'none' });
  });
});

describe('useDependencies', () => {
  it('fails loudly outside the provider', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(renderHook(() => useDependencies())).rejects.toThrow(
      'useDependencies must be used inside <DependenciesProvider>',
    );
    jest.mocked(console.error).mockRestore();
  });
});
