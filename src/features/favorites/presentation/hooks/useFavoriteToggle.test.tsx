import { act, renderHook, waitFor } from '@testing-library/react-native';
import { type ReactNode } from 'react';
import { Provider as ReduxProvider } from 'react-redux';

import { AppError } from '@/core/errors/AppError';
import { err } from '@/core/result';
import { createTestStore } from '@/testing/createTestStore';
import { favorite, favoriteTarget, FAVORITES_NOW, seededFavoritesDatabase } from '@/testing/favoritesFixtures';
import { ManualClock } from '@/testing/ManualClock';
import { createTestDependencies } from '@/testing/testDependencies';
import { FakeTripOwnerProvider } from '@/testing/tripFixtures';

import { type FavoriteTarget } from '../../domain/Favorite';
import { loadFavorites } from '../state/favoritesSlice';
import { selectFavoritesLoadStatus } from '../state/selectors';
import { useFavoriteToggle } from './useFavoriteToggle';

const lisbonTarget = favoriteTarget();
const portugalTarget = favoriteTarget({ targetId: 'country-pt', category: 'country', name: 'Portugal' });
const locked = () => err(new AppError('storage', 'locked'));

/** A store whose favorites already failed to load once (for example on the Saved Places screen). */
async function setupAfterFailedLoad() {
  const storage = await seededFavoritesDatabase({ favorites: [favorite({ id: 'lisbon-fav' })] });
  const dependencies = createTestDependencies({
    database: storage.database,
    tripOwnerProvider: new FakeTripOwnerProvider(),
    clock: new ManualClock(FAVORITES_NOW + 10_000),
  });
  const store = createTestStore(dependencies);
  const load = jest.spyOn(dependencies.getFavorites, 'execute').mockResolvedValueOnce(locked());
  await act(async () => {
    await store.dispatch(loadFavorites());
  });
  expect(selectFavoritesLoadStatus(store.getState())).toBe('failed');

  const wrapper = ({ children }: { children: ReactNode }) => <ReduxProvider store={store}>{children}</ReduxProvider>;
  const render = (target: FavoriteTarget | null) =>
    renderHook(({ current }: { current: FavoriteTarget | null }) => useFavoriteToggle(current), {
      initialProps: { current: target },
      wrapper,
    });
  return { store, load, render };
}

describe('useFavoriteToggle after a failed load', () => {
  it('retries when a detail screen opens, so a place saved earlier shows as saved', async () => {
    const { store, load, render } = await setupAfterFailedLoad();

    const { result } = await render(lisbonTarget);

    await waitFor(() => expect(selectFavoritesLoadStatus(store.getState())).toBe('ready'));
    expect(load).toHaveBeenCalledTimes(2);
    expect(result.current.saved).toBe(true);
    expect(result.current.savedStateUnknown).toBe(false);
  });

  it('retries only once while the load keeps failing, and says the saved state is unknown', async () => {
    const { store, load, render } = await setupAfterFailedLoad();
    load.mockResolvedValue(locked());

    const { result } = await render(lisbonTarget);

    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(selectFavoritesLoadStatus(store.getState())).toBe('failed'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(load).toHaveBeenCalledTimes(2);
    expect(result.current.savedStateUnknown).toBe(true);
  });

  it('retries once more when the sheet shows another place', async () => {
    const { store, load, render } = await setupAfterFailedLoad();
    load.mockResolvedValue(locked());
    const { rerender } = await render(lisbonTarget);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(selectFavoritesLoadStatus(store.getState())).toBe('failed'));

    await rerender({ current: portugalTarget });

    await waitFor(() => expect(load).toHaveBeenCalledTimes(3));
  });

  it('does not load or report anything while there is nothing to save', async () => {
    const { load, render } = await setupAfterFailedLoad();

    const { result } = await render(null);

    expect(load).toHaveBeenCalledTimes(1);
    expect(result.current.savedStateUnknown).toBe(false);
  });
});
