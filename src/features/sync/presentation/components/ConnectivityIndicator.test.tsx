import { act, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';

import { routes } from '@/shared/navigation/routes';
import { FakeConnectivityService, OFFLINE, ONLINE } from '@/testing/FakeConnectivityService';
import { renderWithProviders } from '@/testing/renderWithProviders';

import { BACK_ONLINE_VISIBLE_MS, ConnectivityIndicator } from './ConnectivityIndicator';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn(), replace: jest.fn(), navigate: jest.fn() },
}));

async function setup(initial = ONLINE) {
  const connectivity = new FakeConnectivityService(initial);
  await renderWithProviders(<ConnectivityIndicator />, { dependencies: { connectivity } });
  return { connectivity };
}

describe('ConnectivityIndicator', () => {
  afterEach(() => jest.useRealTimers());

  it('shows nothing while online', async () => {
    await setup();
    expect(screen.queryByTestId('connectivity-indicator')).toBeNull();
  });

  it('shows "Offline" while offline, including at launch, and opens Offline and data', async () => {
    await setup(OFFLINE);
    const pill = screen.getByRole('button', { name: /You're offline\. Your changes are saved on this device/ });
    expect(screen.getByText('Offline')).toBeOnTheScreen();

    await userEvent.setup().press(pill);
    expect(router.push).toHaveBeenCalledWith(routes.offlineData);
  });

  it('shows "Back online" briefly when the connection returns', async () => {
    jest.useFakeTimers();
    const { connectivity } = await setup();

    act(() => connectivity.set(OFFLINE));
    expect(screen.getByText('Offline')).toBeOnTheScreen();

    act(() => connectivity.set(ONLINE));
    expect(screen.getByText('Back online')).toBeOnTheScreen();

    act(() => jest.advanceTimersByTime(BACK_ONLINE_VISIBLE_MS));
    expect(screen.queryByTestId('connectivity-indicator')).toBeNull();
  });

  it('ignores a change of network type that keeps the device online', async () => {
    const { connectivity } = await setup();
    act(() => connectivity.set({ isConnected: true, isInternetReachable: true, type: 'cellular' }));
    expect(screen.queryByTestId('connectivity-indicator')).toBeNull();
  });
});
