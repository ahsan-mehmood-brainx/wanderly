import { act, renderHook, waitFor } from '@testing-library/react-native';
import { type ReactNode } from 'react';
import { Provider as ReduxProvider } from 'react-redux';

import { AppError } from '@/core/errors/AppError';
import { err, type Result } from '@/core/result';
import { createTestStore } from '@/testing/createTestStore';
import { favorite, favoriteTarget, FAVORITES_NOW, seededFavoritesDatabase } from '@/testing/favoritesFixtures';
import { ManualClock } from '@/testing/ManualClock';
import { createTestDependencies } from '@/testing/testDependencies';
import { FakeTripOwnerProvider, TRIP_OWNER } from '@/testing/tripFixtures';

import { type Favorite, type FavoriteTarget } from '../../domain/Favorite';
import { type FavoritesSnapshot } from '../../domain/repositories';
import { selectFavoritesLoadStatus } from '../state/selectors';
import { useFavoriteToggle } from './useFavoriteToggle';

const lisbonTarget = favoriteTarget();
const portugalTarget = favoriteTarget({ targetId: 'country-pt', category: 'country', name: 'Portugal' });

async function setup(favorites: readonly Favorite[] = []) {
  const storage = await seededFavoritesDatabase({ favorites });
  const dependencies = createTestDependencies({
    database: storage.database,
    tripOwnerProvider: new FakeTripOwnerProvider(),
    clock: new ManualClock(FAVORITES_NOW + 10_000),
  });
  const store = createTestStore(dependencies);
  const wrapper = ({ children }: { children: ReactNode }) => <ReduxProvider store={store}>{children}</ReduxProvider>;
  const render = (target: FavoriteTarget | null) =>
    renderHook(({ current }: { current: FavoriteTarget | null }) => useFavoriteToggle(current), {
      initialProps: { current: target },
      wrapper,
    });
  return { ...storage, dependencies, store, render };
}

async function storedTargets(repository: Awaited<ReturnType<typeof setup>>['favoritesRepository']) {
  const result = await repository.loadAll(TRIP_OWNER);
  if (!result.ok) throw result.error;
  return result.value.favorites.map(({ targetId }) => targetId);
}

describe('useFavoriteToggle edge cases', () => {
  it('shows a place tapped Save while the favorites were still loading as saved, and reloads by itself', async () => {
    const { dependencies, store, render, favoritesRepository } = await setup();
    // The first load reads before the tap and finishes after it.
    const snapshot = await dependencies.getFavorites.execute();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    jest
      .spyOn(dependencies.getFavorites, 'execute')
      .mockImplementationOnce(async (): Promise<Result<FavoritesSnapshot, AppError>> => {
        await gate;
        return snapshot;
      });
    const { result } = await render(lisbonTarget);
    expect(selectFavoritesLoadStatus(store.getState())).toBe('loading');

    await act(async () => {
      await result.current.toggle();
    });
    await act(async () => {
      release();
    });

    await waitFor(() => expect(selectFavoritesLoadStatus(store.getState())).toBe('ready'));
    expect(result.current.saved).toBe(true);
    expect(await storedTargets(favoritesRepository)).toEqual(['lisbon']);
  });

  it('does not load or save anything while there is nothing to save (details loading, or a hotel)', async () => {
    const { store, render, dependencies } = await setup();
    const save = jest.spyOn(dependencies.saveFavorite, 'execute');
    const { result } = await render(null);

    await act(async () => {
      await result.current.toggle();
    });

    expect(selectFavoritesLoadStatus(store.getState())).toBe('idle');
    expect(save).not.toHaveBeenCalled();
    expect(result.current.saved).toBe(false);
  });

  it('hides the failure of one place once the sheet shows another place', async () => {
    const { render, dependencies } = await setup();
    jest.spyOn(dependencies.saveFavorite, 'execute').mockResolvedValueOnce(err(new AppError('storage', 'full')));
    const { result, rerender } = await render(lisbonTarget);
    await waitFor(() => expect(result.current.saving).toBe(false));

    await act(async () => {
      await result.current.toggle();
    });
    expect(result.current.errorKind).toBe('storage');
    expect(result.current.saved).toBe(false);

    await rerender({ current: portugalTarget });
    expect(result.current.errorKind).toBeNull();
  });

  it('clears the failure when the next tap succeeds', async () => {
    const { render, dependencies } = await setup();
    jest.spyOn(dependencies.saveFavorite, 'execute').mockResolvedValueOnce(err(new AppError('storage', 'full')));
    const { result } = await render(lisbonTarget);

    await act(async () => {
      await result.current.toggle();
    });
    await act(async () => {
      await result.current.toggle();
    });

    expect(result.current.errorKind).toBeNull();
    expect(result.current.saved).toBe(true);
  });

  it('keeps one record when the favorites failed to load and a place saved earlier is saved again', async () => {
    const saved = favorite({ id: 'lisbon-fav' });
    const { render, dependencies, store, favoritesRepository } = await setup([saved]);
    jest.spyOn(dependencies.getFavorites, 'execute').mockResolvedValueOnce(err(new AppError('storage', 'locked')));
    const { result } = await render(lisbonTarget);
    await waitFor(() => expect(selectFavoritesLoadStatus(store.getState())).toBe('failed'));
    expect(result.current.saved).toBe(false);

    await act(async () => {
      await result.current.toggle();
    });

    expect(result.current.saved).toBe(true);
    expect(await storedTargets(favoritesRepository)).toEqual(['lisbon']);
  });
});
