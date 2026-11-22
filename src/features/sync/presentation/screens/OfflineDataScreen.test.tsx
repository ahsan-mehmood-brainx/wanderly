import { act, screen, userEvent, waitFor, within } from '@testing-library/react-native';

import { AppError } from '@/core/errors/AppError';
import { err } from '@/core/result';
import { type AppDependencies } from '@/core/di/AppDependencies';
import { FakeConnectivityService, OFFLINE } from '@/testing/FakeConnectivityService';
import { ManualClock } from '@/testing/ManualClock';
import { createOfflineStorage, FakeSyncGateway, OFFLINE_NOW } from '@/testing/offlineFixtures';
import { renderWithProviders } from '@/testing/renderWithProviders';
import { storedTrip, TRIP_OWNER } from '@/testing/tripFixtures';

import { OfflineDataScreen } from './OfflineDataScreen';

async function setup(dependencies: Partial<AppDependencies> = {}, prepare?: (deps: AppDependencies) => Promise<void>) {
  const clock = new ManualClock(OFFLINE_NOW);
  const rendered = await renderWithProviders(<OfflineDataScreen />, {
    dependencies: { clock, ...dependencies },
  });
  if (prepare) {
    await act(async () => {
      await prepare(rendered.dependencies);
      await rendered.dependencies.syncEngine.sync();
    });
  }
  return { ...rendered, clock, user: userEvent.setup() };
}

describe('OfflineDataScreen', () => {
  it('says plainly that changes stay on this device, and counts them', async () => {
    await setup({}, async (deps) => {
      await deps.tripRepository.insert(TRIP_OWNER, storedTrip());
      await deps.tripRepository.insert(
        TRIP_OWNER,
        storedTrip({ id: 'trip-2', startDate: '2027-09-01', endDate: '2027-09-05' }),
      );
    });

    const changes = await screen.findByTestId('offline-changes');
    expect(await within(changes).findByText('2 changes saved only on this device')).toBeOnTheScreen();
    expect(within(changes).getByText(/Wanderly doesn't have cloud accounts yet/)).toBeOnTheScreen();
  });

  it('shows the connection state', async () => {
    await setup({ connectivity: new FakeConnectivityService(OFFLINE) });
    const connection = screen.getByTestId('offline-connection');
    expect(within(connection).getByText('Offline')).toBeOnTheScreen();
    expect(
      within(connection).getByText(/Trips, itineraries, expenses and saved places keep working/),
    ).toBeOnTheScreen();
  });

  it('shows saved destination information and clears it after confirming', async () => {
    const { cacheStore } = createOfflineStorage();
    await cacheStore.write('discover.country', 'PT', {
      payload: JSON.stringify({ name: 'x'.repeat(1_500) }),
      version: 1,
      storedAt: OFFLINE_NOW - 2 * 60 * 60_000,
    });
    const { user } = await setup({ cacheStore });

    const saved = await screen.findByTestId('offline-saved-info');
    expect(await within(saved).findByText(/^1 item, 2/)).toBeOnTheScreen();
    expect(within(saved).getByText('Last updated 2 hours ago')).toBeOnTheScreen();

    await user.press(within(saved).getByRole('button', { name: 'Clear saved information' }));
    await user.press(within(screen.getByTestId('clear-saved-sheet')).getByRole('button', { name: 'Clear' }));

    expect(await within(saved).findByText('Saved information cleared.')).toBeOnTheScreen();
    expect(within(saved).getByText('Nothing saved yet')).toBeOnTheScreen();
    expect(await cacheStore.stats()).toEqual([]);
  });

  it('shows a storage error with Try again when saved information cannot be read', async () => {
    await setup({
      getSavedDataSummary: { execute: jest.fn(async () => err(new AppError('storage', 'disk'))) },
    });
    const saved = await screen.findByTestId('offline-saved-info');
    expect(await within(saved).findByText("We couldn't access data saved on this device.")).toBeOnTheScreen();
    expect(within(saved).getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  });

  it('offers to retry changes a backend refused', async () => {
    const gateway = new FakeSyncGateway();
    gateway.respond(err(new AppError('badRequest', 'rejected')));
    const { user } = await setup({ syncGateway: gateway }, async (deps) => {
      await deps.tripRepository.insert(TRIP_OWNER, storedTrip());
    });

    expect(await screen.findByText("1 change couldn't be uploaded")).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(screen.queryByText("1 change couldn't be uploaded")).toBeNull());
    expect(gateway.push).toHaveBeenCalledTimes(2);
  });
});

describe('OfflineDataScreen connection label', () => {
  it('names the connection type in the UI language', async () => {
    await renderWithProviders(<OfflineDataScreen />, {
      initialLanguage: 'es',
      dependencies: {
        connectivity: new FakeConnectivityService({ isConnected: true, isInternetReachable: true, type: 'cellular' }),
      },
    });
    expect(within(screen.getByTestId('offline-connection')).getByText('Conectado (datos móviles)')).toBeOnTheScreen();
  });
});
