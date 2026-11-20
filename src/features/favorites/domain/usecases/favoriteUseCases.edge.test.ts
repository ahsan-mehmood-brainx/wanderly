import {
  customCollection,
  DEFAULT_COLLECTION_IDS,
  favorite,
  favoriteTarget,
  FAVORITES_NOW,
  seededFavoritesDatabase,
} from '@/testing/favoritesFixtures';
import { ManualClock } from '@/testing/ManualClock';
import { createTestDependencies } from '@/testing/testDependencies';
import { FakeTripOwnerProvider, OTHER_TRIP_OWNER, TRIP_OWNER } from '@/testing/tripFixtures';

const lisbon = favorite({ id: 'lisbon-fav' });
const food = customCollection({ id: 'food', name: 'Lisbon food' });

async function setup() {
  const storage = await seededFavoritesDatabase({ favorites: [lisbon], collections: [food] });
  const owners = new FakeTripOwnerProvider();
  const dependencies = createTestDependencies({
    database: storage.database,
    tripOwnerProvider: owners,
    clock: new ManualClock(FAVORITES_NOW + 10_000),
  });
  return { ...storage, dependencies, owners };
}

describe('favorite use cases edge cases', () => {
  it('AC4 allows a custom collection named like a default one, since only custom names must be unique', async () => {
    const { dependencies } = await setup();

    const outcome = await dependencies.createCollection.execute('Must Visit');

    expect(outcome).toMatchObject({ status: 'saved', collection: { kind: 'custom', name: 'Must Visit' } });
  });

  it('refuses renaming to only spaces and keeps the old name', async () => {
    const { dependencies, favoritesRepository } = await setup();

    const outcome = await dependencies.renameCollection.execute({ id: 'food', name: ' \n\t ' });

    expect(outcome).toEqual({ status: 'invalid', error: 'required' });
    const stored = await favoritesRepository.loadAll(TRIP_OWNER);
    expect(stored.ok && stored.value.collections.find(({ id }) => id === 'food')?.name).toBe('Lisbon food');
  });

  it('counts a name of exactly 40 characters inside surrounding spaces as valid', async () => {
    const { dependencies } = await setup();

    const outcome = await dependencies.createCollection.execute(`   ${'a'.repeat(40)}   `);

    expect(outcome).toMatchObject({ status: 'saved', collection: { name: 'a'.repeat(40) } });
  });

  it("lets a new account start with its own default collections and none of the first account's data", async () => {
    const { dependencies, owners } = await setup();
    owners.ownerId = OTHER_TRIP_OWNER;

    const result = await dependencies.getFavorites.execute();

    expect(result.ok && result.value.collections.map(({ id }) => id)).toEqual(DEFAULT_COLLECTION_IDS);
    expect(result.ok && result.value.favorites).toEqual([]);
  });

  it("reports a collection of another account as notFound when renaming, and doesn't change it", async () => {
    const { dependencies, owners, favoritesRepository } = await setup();
    owners.ownerId = OTHER_TRIP_OWNER;

    const outcome = await dependencies.renameCollection.execute({ id: 'food', name: 'Mine' });

    expect(outcome).toMatchObject({ status: 'failed', error: { kind: 'notFound' } });
    const stored = await favoritesRepository.loadAll(TRIP_OWNER);
    expect(stored.ok && stored.value.collections.find(({ id }) => id === 'food')?.name).toBe('Lisbon food');
  });

  it('saves the same place separately for each account and removes only the one asked for', async () => {
    const { dependencies, owners, favoritesRepository } = await setup();
    owners.ownerId = OTHER_TRIP_OWNER;
    const theirs = await dependencies.saveFavorite.execute(favoriteTarget());
    expect(theirs.ok && theirs.value.id).not.toBe('lisbon-fav');

    const removed = await dependencies.removeFavorite.execute('lisbon-fav');

    expect(removed).toMatchObject({ ok: false, error: { kind: 'notFound' } });
    const mine = await favoritesRepository.loadAll(TRIP_OWNER);
    expect(mine.ok && mine.value.favorites.map(({ id }) => id)).toEqual(['lisbon-fav']);
  });

  it('reports a missing favorite when setting its collections, and creates nothing', async () => {
    const { dependencies, favoritesRepository } = await setup();

    const result = await dependencies.setFavoriteCollections.execute({ favoriteId: 'gone', collectionIds: ['food'] });

    expect(result).toMatchObject({ ok: false, error: { kind: 'notFound' } });
    const stored = await favoritesRepository.loadAll(TRIP_OWNER);
    expect(stored.ok && stored.value.memberships).toEqual([]);
  });

  it('refuses deleting a default collection even when its id comes with another account signed in', async () => {
    const { dependencies, owners } = await setup();
    owners.ownerId = OTHER_TRIP_OWNER;

    const result = await dependencies.deleteCollection.execute('want-to-visit');

    expect(result).toMatchObject({ ok: false, error: { kind: 'forbidden' } });
  });
});
