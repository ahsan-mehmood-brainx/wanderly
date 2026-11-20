import { AppError } from '@/core/errors/AppError';
import { err } from '@/core/result';
import { type AuthUser } from '@/features/auth/domain/AuthUser';
import { sessionExpired, signIn, signOut } from '@/features/auth/presentation/state/authSlice';
import { createTestStore } from '@/testing/createTestStore';
import {
  customCollection,
  DEFAULT_COLLECTION_IDS,
  favorite,
  favoriteTarget,
  FAVORITES_NOW,
  restaurantFavorite,
  seededFavoritesDatabase,
} from '@/testing/favoritesFixtures';
import { ManualClock } from '@/testing/ManualClock';
import { createTestDependencies } from '@/testing/testDependencies';
import { FakeTripOwnerProvider, TRIP_OWNER } from '@/testing/tripFixtures';

import { type Favorite } from '../../domain/Favorite';
import {
  createCollection,
  deleteCollection,
  loadFavorites,
  removeFavorite,
  removeFromCollection,
  renameCollection,
  saveFavorite,
  setFavoriteCollections,
} from './favoritesSlice';
import {
  selectAllFavorites,
  selectCollectionById,
  selectCollectionFavorites,
  selectCollectionsWithCounts,
  selectFavoriteByTargetId,
  selectFavoriteCollectionIds,
  selectFavoritesErrorKind,
  selectFavoritesLoadStatus,
  selectFavoritesSaving,
  selectFilteredFavorites,
} from './selectors';

const lisbon = favorite({ id: 'lisbon-fav', savedAt: FAVORITES_NOW });
const julesVerne = restaurantFavorite({ id: 'jules-verne', savedAt: FAVORITES_NOW + 1_000 });
const food = customCollection({ id: 'food', name: 'Lisbon food' });

async function setup(favorites: readonly Favorite[] = [lisbon, julesVerne]) {
  const storage = await seededFavoritesDatabase({
    favorites,
    collections: [food],
    memberships: favorites.some(({ id }) => id === 'jules-verne')
      ? [{ collectionId: 'food', favoriteId: 'jules-verne' }]
      : [],
  });
  const owners = new FakeTripOwnerProvider();
  const dependencies = createTestDependencies({
    database: storage.database,
    tripOwnerProvider: owners,
    clock: new ManualClock(FAVORITES_NOW + 10_000),
  });
  return { ...storage, dependencies, owners, store: createTestStore(dependencies) };
}

type Store = Awaited<ReturnType<typeof setup>>['store'];
const favoriteIds = (store: Store) => selectAllFavorites(store.getState()).map(({ id }) => id);
const counts = (store: Store) =>
  Object.fromEntries(
    selectCollectionsWithCounts(store.getState()).map(({ collection, count }) => [collection.id, count]),
  );

const user: AuthUser = { id: 2, username: 'b', email: 'b@example.com', firstName: 'B', lastName: 'C', imageUrl: null };
const credentials = { username: 'b', password: 'secret' };

describe('favorites state', () => {
  it('AC9 loads the saved places and collections once', async () => {
    const { store, dependencies } = await setup();
    const getFavorites = jest.spyOn(dependencies.getFavorites, 'execute');

    await store.dispatch(loadFavorites());
    await store.dispatch(loadFavorites());

    expect(selectFavoritesLoadStatus(store.getState())).toBe('ready');
    expect(favoriteIds(store)).toEqual(['jules-verne', 'lisbon-fav']);
    expect(selectCollectionsWithCounts(store.getState()).map(({ collection }) => collection.id)).toEqual([
      ...DEFAULT_COLLECTION_IDS,
      'food',
    ]);
    expect(getFavorites).toHaveBeenCalledTimes(1);
    expect(JSON.parse(JSON.stringify(store.getState().favorites))).toEqual(store.getState().favorites);
  });

  it('AC8 records a failed load and can retry', async () => {
    const { store, dependencies } = await setup();
    jest.spyOn(dependencies.getFavorites, 'execute').mockResolvedValueOnce(err(new AppError('storage', 'locked')));

    await store.dispatch(loadFavorites());
    expect(selectFavoritesLoadStatus(store.getState())).toBe('failed');
    expect(selectFavoritesErrorKind(store.getState())).toBe('storage');

    await store.dispatch(loadFavorites());
    expect(selectFavoritesLoadStatus(store.getState())).toBe('ready');
    expect(selectFavoritesErrorKind(store.getState())).toBeNull();
  });

  it('AC2 mirrors a saved favorite, found by its target', async () => {
    const { store } = await setup([]);
    await store.dispatch(loadFavorites());

    const action = await store.dispatch(saveFavorite(favoriteTarget({ targetId: 'country-pt', name: 'Portugal' })));

    expect(action.payload).toMatchObject({ status: 'saved', favorite: { targetId: 'country-pt' } });
    expect(selectFavoriteByTargetId(store.getState(), 'country-pt')?.name).toBe('Portugal');
    expect(selectFavoriteByTargetId(store.getState(), 'lisbon')).toBeUndefined();
  });

  it('AC1 runs one change at a time, so a double tap saves once', async () => {
    const { store, favoritesRepository } = await setup([]);
    await store.dispatch(loadFavorites());

    const [first, second] = await Promise.all([
      store.dispatch(saveFavorite(favoriteTarget())),
      store.dispatch(saveFavorite(favoriteTarget())),
    ]);

    expect(saveFavorite.fulfilled.match(first)).toBe(true);
    expect(saveFavorite.rejected.match(second) && second.meta.condition).toBe(true);
    const saved = await favoritesRepository.loadAll(TRIP_OWNER);
    expect(saved.ok && saved.value.favorites).toHaveLength(1);
    expect(favoriteIds(store)).toHaveLength(1);
    expect(selectFavoritesSaving(store.getState())).toBe(false);
  });

  it('AC1 shows one entry when an already saved target is saved again', async () => {
    const { store } = await setup([lisbon]);
    await store.dispatch(loadFavorites());

    await store.dispatch(saveFavorite(favoriteTarget()));

    expect(favoriteIds(store)).toEqual(['lisbon-fav']);
  });

  it('AC2 removes a favorite and its memberships from the counts', async () => {
    const { store } = await setup();
    await store.dispatch(loadFavorites());
    expect(counts(store)).toMatchObject({ food: 1 });

    const action = await store.dispatch(removeFavorite('jules-verne'));

    expect(action.payload).toEqual({ status: 'removed', id: 'jules-verne' });
    expect(favoriteIds(store)).toEqual(['lisbon-fav']);
    expect(selectFavoriteByTargetId(store.getState(), 'osm:node/102')).toBeUndefined();
    expect(counts(store)).toMatchObject({ food: 0 });
    expect(selectCollectionFavorites(store.getState(), 'food')).toEqual([]);
  });

  it('keeps the favorite when removing it fails', async () => {
    const { store, dependencies } = await setup();
    await store.dispatch(loadFavorites());
    jest
      .spyOn(dependencies.favoritesRepository, 'deleteFavorite')
      .mockResolvedValueOnce(err(new AppError('storage', 'x')));

    const action = await store.dispatch(removeFavorite('jules-verne'));

    expect(action.payload).toEqual({ status: 'failed', errorKind: 'storage' });
    expect(favoriteIds(store)).toEqual(['jules-verne', 'lisbon-fav']);
  });

  it('AC4 adds a created collection after the others, and reports an invalid name', async () => {
    const { store } = await setup();
    await store.dispatch(loadFavorites());

    const created = await store.dispatch(createCollection('Paris eats'));
    const invalid = await store.dispatch(createCollection('lisbon FOOD'));

    expect(created.payload).toMatchObject({ status: 'saved', collection: { name: 'Paris eats' } });
    expect(invalid.payload).toEqual({ status: 'invalid', error: 'duplicate' });
    expect(selectCollectionsWithCounts(store.getState()).map(({ collection }) => collection.name)).toEqual([
      null,
      null,
      null,
      null,
      'Lisbon food',
      'Paris eats',
    ]);
  });

  it('AC5 renames and deletes a custom collection; its places stay saved', async () => {
    const { store } = await setup();
    await store.dispatch(loadFavorites());

    await store.dispatch(renameCollection({ id: 'food', name: 'Porto food' }));
    expect(selectCollectionById(store.getState(), 'food')?.name).toBe('Porto food');

    const deleted = await store.dispatch(deleteCollection('food'));
    expect(deleted.payload).toEqual({ status: 'deleted', id: 'food' });
    expect(selectCollectionById(store.getState(), 'food')).toBeUndefined();
    expect(selectFavoriteCollectionIds(store.getState(), 'jules-verne')).toEqual([]);
    expect(favoriteIds(store)).toEqual(['jules-verne', 'lisbon-fav']);
  });

  it('AC3 keeps a default collection when deleting it is refused', async () => {
    const { store } = await setup();
    await store.dispatch(loadFavorites());

    const action = await store.dispatch(deleteCollection('must-visit'));

    expect(action.payload).toEqual({ status: 'failed', errorKind: 'forbidden' });
    expect(selectCollectionById(store.getState(), 'must-visit')).toBeDefined();
  });

  it('AC6 mirrors the collections a place is in, and the collection details', async () => {
    const { store } = await setup();
    await store.dispatch(loadFavorites());

    await store.dispatch(setFavoriteCollections({ favoriteId: 'lisbon-fav', collectionIds: ['must-visit', 'food'] }));

    expect([...selectFavoriteCollectionIds(store.getState(), 'lisbon-fav')].sort()).toEqual(['food', 'must-visit']);
    expect(
      selectCollectionFavorites(store.getState(), 'food')
        .map(({ id }) => id)
        .sort(),
    ).toEqual(['jules-verne', 'lisbon-fav']);
    expect(counts(store)).toMatchObject({ food: 2, 'must-visit': 1, 'want-to-visit': 0 });

    await store.dispatch(removeFromCollection({ collectionId: 'food', favoriteId: 'jules-verne' }));

    expect(selectCollectionFavorites(store.getState(), 'food').map(({ id }) => id)).toEqual(['lisbon-fav']);
    expect(favoriteIds(store)).toEqual(['jules-verne', 'lisbon-fav']);
  });

  it('AC7 filters the saved places by search and category', async () => {
    const { store } = await setup();
    await store.dispatch(loadFavorites());

    expect(selectFilteredFavorites(store.getState(), { query: 'JULES', category: 'all' }).map(({ id }) => id)).toEqual([
      'jules-verne',
    ]);
    expect(
      selectFilteredFavorites(store.getState(), { query: '', category: 'destination' }).map(({ id }) => id),
    ).toEqual(['lisbon-fav']);
    expect(selectFilteredFavorites(store.getState(), { query: 'jules', category: 'destination' })).toEqual([]);
  });

  it('releases the change lock after an unexpected throw', async () => {
    const { store, dependencies } = await setup();
    await store.dispatch(loadFavorites());
    jest.spyOn(dependencies.saveFavorite, 'execute').mockRejectedValueOnce(new Error('bug'));

    await store.dispatch(saveFavorite(favoriteTarget({ targetId: 'country-pt' })));

    expect(selectFavoritesSaving(store.getState())).toBe(false);
  });

  describe('when the account changes', () => {
    it.each([
      ['sign-out', signOut.fulfilled(undefined, 'r')],
      ['a failed sign-out', signOut.rejected(new Error('x'), 'r')],
      ['session expiry', sessionExpired()],
      ['a new sign-in', signIn.fulfilled(user, 'r', credentials)],
    ])('AC9 forgets the favorites on %s', async (_name, action) => {
      const { store } = await setup();
      await store.dispatch(loadFavorites());
      expect(favoriteIds(store)).toHaveLength(2);

      store.dispatch(action);

      expect(favoriteIds(store)).toEqual([]);
      expect(selectCollectionsWithCounts(store.getState())).toEqual([]);
      expect(selectFavoritesLoadStatus(store.getState())).toBe('idle');
    });

    it('stays idle while signed out, so the next sign-in loads', async () => {
      const { store, owners, dependencies } = await setup();
      const getFavorites = jest.spyOn(dependencies.getFavorites, 'execute');
      owners.ownerId = null;

      await store.dispatch(loadFavorites());

      expect(getFavorites).not.toHaveBeenCalled();
      expect(selectFavoritesLoadStatus(store.getState())).toBe('idle');
    });

    it('AC9 ignores a load that finishes after sign-out', async () => {
      const { store } = await setup();
      const loading = store.dispatch(loadFavorites());

      store.dispatch(signOut.fulfilled(undefined, 'r'));
      await loading;

      expect(favoriteIds(store)).toEqual([]);
      expect(selectFavoritesLoadStatus(store.getState())).toBe('idle');
    });

    it('AC9 ignores a save that finishes after sign-out, and allows new ones', async () => {
      const { store } = await setup([]);
      await store.dispatch(loadFavorites());
      const saving = store.dispatch(saveFavorite(favoriteTarget()));

      store.dispatch(signOut.fulfilled(undefined, 'r'));
      expect(selectFavoritesSaving(store.getState())).toBe(false);
      await saving;

      expect(favoriteIds(store)).toEqual([]);
      expect(selectFavoritesSaving(store.getState())).toBe(false);
    });
  });
});
