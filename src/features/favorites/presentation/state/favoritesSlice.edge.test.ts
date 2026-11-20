import { type AppError } from '@/core/errors/AppError';
import { type Result } from '@/core/result';
import { signOut } from '@/features/auth/presentation/state/authSlice';
import { createTestStore } from '@/testing/createTestStore';
import {
  customCollection,
  favorite,
  favoriteTarget,
  FAVORITES_NOW,
  seededFavoritesDatabase,
} from '@/testing/favoritesFixtures';
import { ManualClock } from '@/testing/ManualClock';
import { createTestDependencies } from '@/testing/testDependencies';
import { FakeTripOwnerProvider, TRIP_OWNER } from '@/testing/tripFixtures';

import { type Favorite } from '../../domain/Favorite';
import { type FavoritesSnapshot } from '../../domain/repositories';
import {
  createCollection,
  deleteCollection,
  loadFavorites,
  removeFavorite,
  saveFavorite,
  setFavoriteCollections,
} from './favoritesSlice';
import {
  selectAllFavorites,
  selectCollectionById,
  selectFavoriteByTargetId,
  selectFavoriteCollectionIds,
  selectFavoritesLoadStatus,
  selectFavoritesSaving,
} from './selectors';

const lisbon = favorite({ id: 'lisbon-fav', savedAt: FAVORITES_NOW });

async function setup(favorites: readonly Favorite[] = []) {
  const storage = await seededFavoritesDatabase({ favorites, collections: [customCollection({ id: 'food' })] });
  const owners = new FakeTripOwnerProvider();
  const dependencies = createTestDependencies({
    database: storage.database,
    tripOwnerProvider: owners,
    clock: new ManualClock(FAVORITES_NOW + 10_000),
  });
  return { ...storage, dependencies, owners, store: createTestStore(dependencies) };
}

/**
 * Reads the database now and makes the next load return that snapshot only after
 * `release()`: the load reads before whatever the test does next.
 */
async function holdNextLoad(dependencies: ReturnType<typeof createTestDependencies>) {
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
  return () => release();
}

const ids = (favorites: readonly Favorite[]) => favorites.map(({ id }) => id);

describe('favorites state: changes and a load running at the same time', () => {
  it('keeps a place saved while the first load was still reading, once loading settles', async () => {
    const { store, dependencies } = await setup();
    const release = await holdNextLoad(dependencies);
    const loading = store.dispatch(loadFavorites());

    await store.dispatch(saveFavorite(favoriteTarget()));
    release();
    await loading;
    // Screens dispatch a load whenever the status is idle.
    await store.dispatch(loadFavorites());

    expect(selectFavoriteByTargetId(store.getState(), 'lisbon')).toBeDefined();
    expect(selectFavoritesLoadStatus(store.getState())).toBe('ready');
  });

  it('never shows the stale load result in between: a place saved during the load stays saved', async () => {
    const { store, dependencies } = await setup();
    const release = await holdNextLoad(dependencies);
    const loading = store.dispatch(loadFavorites());

    await store.dispatch(saveFavorite(favoriteTarget()));
    release();
    await loading;

    expect(selectFavoriteByTargetId(store.getState(), 'lisbon')).toBeDefined();
  });

  it('does not bring back a place removed while the load was reading', async () => {
    const { store, dependencies } = await setup([lisbon]);
    await store.dispatch(loadFavorites());
    // Force a fresh load (as after a failure and retry) that reads before the removal.
    store.dispatch(signOut.fulfilled(undefined, 'r'));
    const release = await holdNextLoad(dependencies);
    const loading = store.dispatch(loadFavorites());

    await store.dispatch(removeFavorite('lisbon-fav'));
    release();
    await loading;
    await store.dispatch(loadFavorites());

    expect(ids(selectAllFavorites(store.getState()))).toEqual([]);
  });

  it('does not bring back a collection deleted while the load was reading', async () => {
    const { store, dependencies } = await setup();
    const release = await holdNextLoad(dependencies);
    const loading = store.dispatch(loadFavorites());

    await store.dispatch(deleteCollection('food'));
    release();
    await loading;
    await store.dispatch(loadFavorites());

    expect(selectCollectionById(store.getState(), 'food')).toBeUndefined();
  });

  it('keeps a collection created while the load was reading', async () => {
    const { store, dependencies } = await setup();
    const release = await holdNextLoad(dependencies);
    const loading = store.dispatch(loadFavorites());

    const created = await store.dispatch(createCollection('Rome eats'));
    release();
    await loading;
    await store.dispatch(loadFavorites());

    const id =
      createCollection.fulfilled.match(created) && created.payload.status === 'saved'
        ? created.payload.collection.id
        : '';
    expect(selectCollectionById(store.getState(), id)?.name).toBe('Rome eats');
  });

  it('applies a load normally when no change finished while it was reading', async () => {
    const { store, dependencies } = await setup([lisbon]);
    const release = await holdNextLoad(dependencies);
    const loading = store.dispatch(loadFavorites());

    release();
    await loading;

    expect(selectFavoritesLoadStatus(store.getState())).toBe('ready');
    expect(ids(selectAllFavorites(store.getState()))).toEqual(['lisbon-fav']);
  });

  it('applies the load when the change during it failed, since nothing was written', async () => {
    const { store, dependencies } = await setup([lisbon]);
    const release = await holdNextLoad(dependencies);
    const loading = store.dispatch(loadFavorites());

    const removed = await store.dispatch(removeFavorite('missing'));
    release();
    await loading;

    expect(removed.payload).toEqual({ status: 'failed', errorKind: 'notFound' });
    expect(selectFavoritesLoadStatus(store.getState())).toBe('ready');
    expect(ids(selectAllFavorites(store.getState()))).toEqual(['lisbon-fav']);
  });
});

describe('favorites state: edge cases of single changes', () => {
  it('reports unauthorized for a save after the account signed out, and stores nothing', async () => {
    const { store, owners, favoritesRepository } = await setup();
    await store.dispatch(loadFavorites());
    owners.ownerId = null;

    const action = await store.dispatch(saveFavorite(favoriteTarget()));

    expect(action.payload).toEqual({ status: 'failed', errorKind: 'unauthorized' });
    expect(selectAllFavorites(store.getState())).toEqual([]);
    const stored = await favoritesRepository.loadAll(TRIP_OWNER);
    expect(stored.ok && stored.value.favorites).toEqual([]);
  });

  it('releases the change lock after a failed change so the next tap works', async () => {
    const { store } = await setup([lisbon]);
    await store.dispatch(loadFavorites());

    await store.dispatch(removeFavorite('missing'));
    expect(selectFavoritesSaving(store.getState())).toBe(false);

    const next = await store.dispatch(removeFavorite('lisbon-fav'));
    expect(next.payload).toEqual({ status: 'removed', id: 'lisbon-fav' });
  });

  it('keeps the memberships unchanged when setting collections fails for a missing collection', async () => {
    const { store } = await setup([lisbon]);
    await store.dispatch(loadFavorites());
    await store.dispatch(setFavoriteCollections({ favoriteId: 'lisbon-fav', collectionIds: ['must-visit'] }));

    const action = await store.dispatch(
      setFavoriteCollections({ favoriteId: 'lisbon-fav', collectionIds: ['food', 'no-such-collection'] }),
    );

    expect(action.payload).toEqual({ status: 'failed', errorKind: 'notFound' });
    expect(selectFavoriteCollectionIds(store.getState(), 'lisbon-fav')).toEqual(['must-visit']);
  });

  it('empties the collections of a place when no collection is ticked', async () => {
    const { store } = await setup([lisbon]);
    await store.dispatch(loadFavorites());
    await store.dispatch(setFavoriteCollections({ favoriteId: 'lisbon-fav', collectionIds: ['must-visit', 'food'] }));

    await store.dispatch(setFavoriteCollections({ favoriteId: 'lisbon-fav', collectionIds: [] }));

    expect(selectFavoriteCollectionIds(store.getState(), 'lisbon-fav')).toEqual([]);
  });
});
