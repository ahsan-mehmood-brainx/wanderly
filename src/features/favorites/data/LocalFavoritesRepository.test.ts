import { APP_MIGRATIONS } from '@/bootstrap/databaseMigrations';
import { SqliteDatabase } from '@/core/database/SqliteDatabase';
import { LocalTripRepository } from '@/features/trips/data/LocalTripRepository';
import {
  createFavoritesStorage,
  customCollection,
  DEFAULT_COLLECTION_IDS,
  favorite,
  FAVORITES_NOW,
  restaurantFavorite,
  seededFavoritesDatabase,
  seedFavorites,
} from '@/testing/favoritesFixtures';
import { createNodeSqliteEngine, nodeSqliteDriver } from '@/testing/nodeSqliteDriver';
import { createTestLogger } from '@/testing/testDependencies';
import { OTHER_TRIP_OWNER, storedTrip, TRIP_OWNER } from '@/testing/tripFixtures';

import { type Favorite } from '../domain/Favorite';
import { type FavoritesRepository } from '../domain/repositories';
import { LocalFavoritesRepository } from './LocalFavoritesRepository';

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!result.ok) throw result.error;
  return result.value;
};

const lisbon = favorite({ id: 'lisbon-fav', savedAt: FAVORITES_NOW });
const julesVerne = restaurantFavorite({ id: 'jules-verne', savedAt: FAVORITES_NOW + 1_000 });
const food = customCollection({ id: 'food', name: 'Lisbon food' });

async function load(repository: FavoritesRepository, ownerId = TRIP_OWNER) {
  return unwrap(await repository.loadAll(ownerId));
}

const membershipPairs = async (repository: FavoritesRepository, ownerId = TRIP_OWNER) =>
  (await load(repository, ownerId)).memberships
    .map(({ collectionId, favoriteId }) => `${collectionId}:${favoriteId}`)
    .sort();

describe('LocalFavoritesRepository', () => {
  describe('schema', () => {
    it('AC9 is migration 3, after trips and activities', () => {
      expect(APP_MIGRATIONS.map(({ version }) => version)).toEqual([1, 2, 3]);
    });

    it('AC9 creates the favorites, collections and membership tables', async () => {
      const { database } = createFavoritesStorage();
      const tables = await database.getAll<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('favorites', 'collections', 'collection_items') ORDER BY name",
      );
      expect(tables.map(({ name }) => name)).toEqual(['collection_items', 'collections', 'favorites']);
    });

    it('AC9 upgrades a database already at version 2 and keeps its trips', async () => {
      const engine = createNodeSqliteEngine();
      const logger = createTestLogger();
      const open = (migrations = APP_MIGRATIONS) =>
        new SqliteDatabase({ driver: nodeSqliteDriver(() => engine).driver, migrations, logger });

      const before = open(APP_MIGRATIONS.filter(({ version }) => version <= 2));
      await new LocalTripRepository(before, logger).insert(TRIP_OWNER, storedTrip());
      await before.close();

      const after = open();
      const repository = new LocalFavoritesRepository(after, logger);
      expect(unwrap(await repository.insertFavorite(TRIP_OWNER, lisbon))).toEqual(lisbon);
      expect(unwrap(await new LocalTripRepository(after, logger).list(TRIP_OWNER))).toHaveLength(1);
    });

    it.each([
      ['an unknown category', { category: 'hotel' as Favorite['category'] }],
      ['an empty name', { name: '' }],
      ['only one coordinate', { latitude: 38.7, longitude: null }],
    ])('rejects a favorite with %s even if validation were bypassed', async (_label, overrides) => {
      const { favoritesRepository } = await seededFavoritesDatabase();
      const result = await favoritesRepository.insertFavorite(TRIP_OWNER, favorite(overrides));
      expect(!result.ok && result.error.kind).toBe('storage');
      expect((await load(favoritesRepository)).favorites).toEqual([]);
    });

    it('rejects a custom collection without a name', async () => {
      const { favoritesRepository } = await seededFavoritesDatabase();
      const result = await favoritesRepository.insertCollection(TRIP_OWNER, customCollection({ name: '' }));
      expect(!result.ok && result.error.kind).toBe('storage');
    });

    it('rejects a favorite without an owner', async () => {
      const { favoritesRepository } = createFavoritesStorage();
      const result = await favoritesRepository.insertFavorite('', lisbon);
      expect(!result.ok && result.error.kind).toBe('storage');
    });
  });

  describe('favorites', () => {
    it('AC9 stores and reads back every field', async () => {
      const { favoritesRepository } = await seededFavoritesDatabase();
      const item = favorite({
        name: 'Ünï "quoted" \'name\'; DROP TABLE favorites',
        subtitle: 'Line one\nLine two',
        imageUrl: null,
        flagEmoji: null,
        latitude: null,
        longitude: null,
        address: 'Rua Augusta',
        savedAt: 42,
      });

      expect(unwrap(await favoritesRepository.insertFavorite(TRIP_OWNER, item))).toEqual(item);
      expect((await load(favoritesRepository)).favorites).toEqual([item]);
      expect(unwrap(await favoritesRepository.findByTarget(TRIP_OWNER, item.targetId))).toEqual(item);
    });

    it('lists favorites newest first', async () => {
      const { favoritesRepository } = await seededFavoritesDatabase({ favorites: [lisbon, julesVerne] });
      expect((await load(favoritesRepository)).favorites.map(({ id }) => id)).toEqual(['jules-verne', 'lisbon-fav']);
    });

    it('finds nothing for a target that was never saved', async () => {
      const { favoritesRepository } = await seededFavoritesDatabase({ favorites: [lisbon] });
      expect(unwrap(await favoritesRepository.findByTarget(TRIP_OWNER, 'osm:node/999'))).toBeNull();
    });

    it('AC1 keeps one row per target and returns the favorite already saved', async () => {
      const { favoritesRepository, database } = await seededFavoritesDatabase({ favorites: [lisbon] });

      const again = await favoritesRepository.insertFavorite(
        TRIP_OWNER,
        favorite({ id: 'second-tap', savedAt: FAVORITES_NOW + 5 }),
      );

      expect(unwrap(again)).toEqual(lisbon);
      await expect(
        database.getFirst("SELECT COUNT(*) AS count FROM favorites WHERE owner_id = ? AND target_id = 'lisbon'", [
          TRIP_OWNER,
        ]),
      ).resolves.toEqual({ count: 1 });
    });

    it('AC2 deletes a favorite together with its collection memberships', async () => {
      const { favoritesRepository, database } = await seededFavoritesDatabase({
        favorites: [lisbon, julesVerne],
        collections: [food],
        memberships: [
          { collectionId: 'food', favoriteId: 'jules-verne' },
          { collectionId: 'must-visit', favoriteId: 'jules-verne' },
          { collectionId: 'must-visit', favoriteId: 'lisbon-fav' },
        ],
      });

      expect(await favoritesRepository.deleteFavorite(TRIP_OWNER, 'jules-verne')).toEqual({
        ok: true,
        value: undefined,
      });

      expect((await load(favoritesRepository)).favorites.map(({ id }) => id)).toEqual(['lisbon-fav']);
      expect(await membershipPairs(favoritesRepository)).toEqual(['must-visit:lisbon-fav']);
      await expect(
        database.getFirst("SELECT COUNT(*) AS count FROM collection_items WHERE favorite_id = 'jules-verne'"),
      ).resolves.toEqual({ count: 0 });
    });

    it('reports deleting a favorite that does not exist', async () => {
      const { favoritesRepository } = await seededFavoritesDatabase();
      const result = await favoritesRepository.deleteFavorite(TRIP_OWNER, 'nope');
      expect(!result.ok && result.error.kind).toBe('notFound');
    });

    it('AC1 lets a target be saved again after it was removed', async () => {
      const { favoritesRepository } = await seededFavoritesDatabase({ favorites: [lisbon] });
      await favoritesRepository.deleteFavorite(TRIP_OWNER, 'lisbon-fav');

      const fresh = favorite({ id: 'fresh', savedAt: FAVORITES_NOW + 10 });
      expect(unwrap(await favoritesRepository.insertFavorite(TRIP_OWNER, fresh))).toEqual(fresh);
    });
  });

  describe('collections', () => {
    it('AC3 creates the four default collections once, however often it is asked', async () => {
      const { favoritesRepository } = createFavoritesStorage();

      unwrap(await favoritesRepository.ensureDefaultCollections(TRIP_OWNER, FAVORITES_NOW));
      unwrap(await favoritesRepository.ensureDefaultCollections(TRIP_OWNER, FAVORITES_NOW + 1));

      const { collections } = await load(favoritesRepository);
      expect(collections).toEqual([
        {
          id: 'want-to-visit',
          kind: 'default',
          defaultKey: 'wantToVisit',
          name: null,
          createdAt: FAVORITES_NOW,
          updatedAt: FAVORITES_NOW,
        },
        {
          id: 'must-visit',
          kind: 'default',
          defaultKey: 'mustVisit',
          name: null,
          createdAt: FAVORITES_NOW,
          updatedAt: FAVORITES_NOW,
        },
        {
          id: 'favorite-restaurants',
          kind: 'default',
          defaultKey: 'favoriteRestaurants',
          name: null,
          createdAt: FAVORITES_NOW,
          updatedAt: FAVORITES_NOW,
        },
        {
          id: 'favorite-attractions',
          kind: 'default',
          defaultKey: 'favoriteAttractions',
          name: null,
          createdAt: FAVORITES_NOW,
          updatedAt: FAVORITES_NOW,
        },
      ]);
    });

    it('AC4 lists custom collections after the defaults, oldest first', async () => {
      const { favoritesRepository } = await seededFavoritesDatabase({
        collections: [
          customCollection({ id: 'later', name: 'Later', createdAt: FAVORITES_NOW + 2 }),
          customCollection({ id: 'first', name: 'First', createdAt: FAVORITES_NOW + 1 }),
        ],
      });

      expect((await load(favoritesRepository)).collections.map(({ id }) => id)).toEqual([
        ...DEFAULT_COLLECTION_IDS,
        'first',
        'later',
      ]);
    });

    it('AC5 renames a collection and moves updatedAt', async () => {
      const { favoritesRepository } = await seededFavoritesDatabase({ collections: [food] });

      unwrap(await favoritesRepository.renameCollection(TRIP_OWNER, 'food', 'Porto food', FAVORITES_NOW + 9));

      expect((await load(favoritesRepository)).collections.find(({ id }) => id === 'food')).toEqual({
        ...food,
        name: 'Porto food',
        updatedAt: FAVORITES_NOW + 9,
      });
    });

    it('reports renaming a collection that does not exist', async () => {
      const { favoritesRepository } = await seededFavoritesDatabase();
      const result = await favoritesRepository.renameCollection(TRIP_OWNER, 'nope', 'Name', 1);
      expect(!result.ok && result.error.kind).toBe('notFound');
    });

    it('AC5 deletes a collection and its memberships but keeps every place saved', async () => {
      const { favoritesRepository } = await seededFavoritesDatabase({
        favorites: [lisbon, julesVerne],
        collections: [food],
        memberships: [
          { collectionId: 'food', favoriteId: 'jules-verne' },
          { collectionId: 'food', favoriteId: 'lisbon-fav' },
          { collectionId: 'must-visit', favoriteId: 'jules-verne' },
        ],
      });

      expect(await favoritesRepository.deleteCollection(TRIP_OWNER, 'food')).toEqual({ ok: true, value: undefined });

      const snapshot = await load(favoritesRepository);
      expect(snapshot.collections.map(({ id }) => id)).toEqual(DEFAULT_COLLECTION_IDS);
      expect(snapshot.favorites.map(({ id }) => id)).toEqual(['jules-verne', 'lisbon-fav']);
      expect(await membershipPairs(favoritesRepository)).toEqual(['must-visit:jules-verne']);
    });

    it('reports deleting a collection that does not exist', async () => {
      const { favoritesRepository } = await seededFavoritesDatabase();
      const result = await favoritesRepository.deleteCollection(TRIP_OWNER, 'nope');
      expect(!result.ok && result.error.kind).toBe('notFound');
    });
  });

  describe('memberships', () => {
    it('AC6 puts a place in several collections', async () => {
      const { favoritesRepository } = await seededFavoritesDatabase({ favorites: [julesVerne], collections: [food] });

      unwrap(await favoritesRepository.setMemberships(TRIP_OWNER, 'jules-verne', ['food', 'must-visit'], 77));

      expect((await load(favoritesRepository)).memberships).toEqual(
        expect.arrayContaining([
          { collectionId: 'food', favoriteId: 'jules-verne', addedAt: 77 },
          { collectionId: 'must-visit', favoriteId: 'jules-verne', addedAt: 77 },
        ]),
      );
      expect(await membershipPairs(favoritesRepository)).toHaveLength(2);
    });

    it('AC6 never stores a membership twice, and keeps when it was first added', async () => {
      const { favoritesRepository, database } = await seededFavoritesDatabase({ favorites: [julesVerne] });

      await favoritesRepository.setMemberships(TRIP_OWNER, 'jules-verne', ['must-visit'], 10);
      await favoritesRepository.setMemberships(TRIP_OWNER, 'jules-verne', ['must-visit', 'must-visit'], 20);

      expect((await load(favoritesRepository)).memberships).toEqual([
        { collectionId: 'must-visit', favoriteId: 'jules-verne', addedAt: 10 },
      ]);
      await expect(database.getFirst('SELECT COUNT(*) AS count FROM collection_items')).resolves.toEqual({ count: 1 });
    });

    it('AC6 drops the collections that were unticked', async () => {
      const { favoritesRepository } = await seededFavoritesDatabase({
        favorites: [julesVerne],
        collections: [food],
        memberships: [
          { collectionId: 'food', favoriteId: 'jules-verne' },
          { collectionId: 'must-visit', favoriteId: 'jules-verne' },
        ],
      });

      unwrap(await favoritesRepository.setMemberships(TRIP_OWNER, 'jules-verne', ['favorite-restaurants'], 30));

      expect(await membershipPairs(favoritesRepository)).toEqual(['favorite-restaurants:jules-verne']);
    });

    it('AC6 changes nothing when one of the collections does not exist', async () => {
      const { favoritesRepository } = await seededFavoritesDatabase({
        favorites: [julesVerne],
        memberships: [{ collectionId: 'must-visit', favoriteId: 'jules-verne' }],
      });

      const result = await favoritesRepository.setMemberships(TRIP_OWNER, 'jules-verne', ['want-to-visit', 'gone'], 40);

      expect(result.ok).toBe(false);
      expect(await membershipPairs(favoritesRepository)).toEqual(['must-visit:jules-verne']);
    });

    it('AC6 removes a place from one collection without unsaving it', async () => {
      const { favoritesRepository } = await seededFavoritesDatabase({
        favorites: [julesVerne],
        collections: [food],
        memberships: [
          { collectionId: 'food', favoriteId: 'jules-verne' },
          { collectionId: 'must-visit', favoriteId: 'jules-verne' },
        ],
      });

      unwrap(await favoritesRepository.removeMembership(TRIP_OWNER, 'food', 'jules-verne'));

      expect(await membershipPairs(favoritesRepository)).toEqual(['must-visit:jules-verne']);
      expect((await load(favoritesRepository)).favorites.map(({ id }) => id)).toEqual(['jules-verne']);
    });
  });

  describe('separation between accounts', () => {
    async function twoAccounts() {
      const storage = await seededFavoritesDatabase({
        favorites: [lisbon],
        collections: [food],
        memberships: [{ collectionId: 'food', favoriteId: 'lisbon-fav' }],
      });
      await seedFavorites(storage.favoritesRepository, {
        ownerId: OTHER_TRIP_OWNER,
        favorites: [julesVerne],
        memberships: [{ collectionId: 'must-visit', favoriteId: 'jules-verne' }],
      });
      return storage;
    }

    it("AC9 loads only the owner's favorites, collections and memberships", async () => {
      const { favoritesRepository } = await twoAccounts();

      const mine = await load(favoritesRepository);
      const theirs = await load(favoritesRepository, OTHER_TRIP_OWNER);

      expect(mine.favorites.map(({ id }) => id)).toEqual(['lisbon-fav']);
      expect(mine.collections.map(({ id }) => id)).toEqual([...DEFAULT_COLLECTION_IDS, 'food']);
      expect(await membershipPairs(favoritesRepository)).toEqual(['food:lisbon-fav']);
      expect(theirs.favorites.map(({ id }) => id)).toEqual(['jules-verne']);
      expect(theirs.collections.map(({ id }) => id)).toEqual(DEFAULT_COLLECTION_IDS);
      expect(await membershipPairs(favoritesRepository, OTHER_TRIP_OWNER)).toEqual(['must-visit:jules-verne']);
    });

    it('AC9 lets two accounts save the same target', async () => {
      const { favoritesRepository } = await twoAccounts();
      const theirLisbon = favorite({ id: 'their-lisbon' });

      expect(unwrap(await favoritesRepository.insertFavorite(OTHER_TRIP_OWNER, theirLisbon))).toEqual(theirLisbon);
      expect(unwrap(await favoritesRepository.findByTarget(TRIP_OWNER, 'lisbon'))?.id).toBe('lisbon-fav');
    });

    it("AC9 treats another account's data as missing and leaves it unchanged", async () => {
      const { favoritesRepository } = await twoAccounts();

      const deleted = await favoritesRepository.deleteFavorite(TRIP_OWNER, 'jules-verne');
      const renamed = await favoritesRepository.renameCollection(OTHER_TRIP_OWNER, 'food', 'Taken', 1);
      const removed = await favoritesRepository.deleteCollection(OTHER_TRIP_OWNER, 'food');

      expect(!deleted.ok && deleted.error.kind).toBe('notFound');
      expect(!renamed.ok && renamed.error.kind).toBe('notFound');
      expect(!removed.ok && removed.error.kind).toBe('notFound');
      expect(unwrap(await favoritesRepository.findByTarget(TRIP_OWNER, 'osm:node/102'))).toBeNull();
      expect((await load(favoritesRepository, OTHER_TRIP_OWNER)).favorites.map(({ id }) => id)).toEqual([
        'jules-verne',
      ]);
      expect((await load(favoritesRepository)).collections.find(({ id }) => id === 'food')?.name).toBe('Lisbon food');
    });
  });

  it('AC9 keeps favorites, collections and memberships across an app restart', async () => {
    const engine = createNodeSqliteEngine();
    const logger = createTestLogger();
    const open = () =>
      new SqliteDatabase({ driver: nodeSqliteDriver(() => engine).driver, migrations: APP_MIGRATIONS, logger });

    const first = open();
    await seedFavorites(new LocalFavoritesRepository(first, logger), {
      favorites: [lisbon],
      collections: [food],
      memberships: [{ collectionId: 'food', favoriteId: 'lisbon-fav' }],
    });
    await first.close();

    const reopened = await load(new LocalFavoritesRepository(open(), logger));
    expect(reopened.favorites).toEqual([lisbon]);
    expect(reopened.collections.map(({ id }) => id)).toEqual([...DEFAULT_COLLECTION_IDS, 'food']);
    expect(reopened.memberships).toEqual([{ collectionId: 'food', favoriteId: 'lisbon-fav', addedAt: FAVORITES_NOW }]);
  });

  it('skips a corrupt row, logs it, and still returns the rest', async () => {
    const { favoritesRepository, database, logger } = await seededFavoritesDatabase({
      favorites: [lisbon, julesVerne],
    });
    await database.run('PRAGMA ignore_check_constraints = ON');
    await database.run("UPDATE favorites SET category = 'nightlife' WHERE id = 'jules-verne'");

    expect((await load(favoritesRepository)).favorites.map(({ id }) => id)).toEqual(['lisbon-fav']);
    expect(unwrap(await favoritesRepository.findByTarget(TRIP_OWNER, 'osm:node/102'))).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('turns database failures into storage errors instead of throwing', async () => {
    const { favoritesRepository, handle } = createFavoritesStorage();
    handle.failOpens = 1;
    const result = await favoritesRepository.loadAll(TRIP_OWNER);
    expect(!result.ok && result.error.kind).toBe('storage');
    expect((await favoritesRepository.loadAll(TRIP_OWNER)).ok).toBe(true);
  });
});
