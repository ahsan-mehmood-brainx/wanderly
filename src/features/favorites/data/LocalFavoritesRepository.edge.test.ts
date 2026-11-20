import {
  customCollection,
  favorite,
  FAVORITES_NOW,
  restaurantFavorite,
  seededFavoritesDatabase,
  seedFavorites,
} from '@/testing/favoritesFixtures';
import { OTHER_TRIP_OWNER, TRIP_OWNER } from '@/testing/tripFixtures';

const lisbon = favorite({ id: 'lisbon-fav' });
const food = customCollection({ id: 'food', name: 'Lisbon food' });

async function setup() {
  const storage = await seededFavoritesDatabase({
    favorites: [lisbon],
    collections: [food],
    memberships: [{ collectionId: 'food', favoriteId: 'lisbon-fav' }],
  });
  await seedFavorites(storage.favoritesRepository, { ownerId: OTHER_TRIP_OWNER });
  return storage;
}

async function snapshot(repository: Awaited<ReturnType<typeof setup>>['favoritesRepository'], ownerId = TRIP_OWNER) {
  const result = await repository.loadAll(ownerId);
  if (!result.ok) throw result.error;
  return result.value;
}

describe('LocalFavoritesRepository edge cases', () => {
  describe("another account can't change this account's data", () => {
    it('refuses to delete the favorite as notFound', async () => {
      const { favoritesRepository } = await setup();

      const result = await favoritesRepository.deleteFavorite(OTHER_TRIP_OWNER, 'lisbon-fav');

      expect(result).toEqual({ ok: false, error: expect.objectContaining({ kind: 'notFound' }) });
      expect((await snapshot(favoritesRepository)).favorites.map(({ id }) => id)).toEqual(['lisbon-fav']);
    });

    it('refuses to put the favorite in its own default collection', async () => {
      const { favoritesRepository } = await setup();

      const result = await favoritesRepository.setMemberships(
        OTHER_TRIP_OWNER,
        'lisbon-fav',
        ['must-visit'],
        FAVORITES_NOW,
      );

      expect(result).toEqual({ ok: false, error: expect.objectContaining({ kind: 'notFound' }) });
      expect((await snapshot(favoritesRepository, OTHER_TRIP_OWNER)).memberships).toEqual([]);
    });

    it('refuses to put its own favorite in a collection of this account', async () => {
      const { favoritesRepository } = await setup();
      const theirs = restaurantFavorite({ id: 'their-fav' });
      await favoritesRepository.insertFavorite(OTHER_TRIP_OWNER, theirs);

      const result = await favoritesRepository.setMemberships(OTHER_TRIP_OWNER, 'their-fav', ['food'], FAVORITES_NOW);

      expect(result).toEqual({ ok: false, error: expect.objectContaining({ kind: 'notFound' }) });
      expect((await snapshot(favoritesRepository)).memberships).toEqual([
        expect.objectContaining({ collectionId: 'food', favoriteId: 'lisbon-fav' }),
      ]);
    });

    it('refuses to rename, delete or empty the custom collection', async () => {
      const { favoritesRepository } = await setup();

      const renamed = await favoritesRepository.renameCollection(OTHER_TRIP_OWNER, 'food', 'Mine now', FAVORITES_NOW);
      const removed = await favoritesRepository.removeMembership(OTHER_TRIP_OWNER, 'food', 'lisbon-fav');
      const deleted = await favoritesRepository.deleteCollection(OTHER_TRIP_OWNER, 'food');

      for (const result of [renamed, removed, deleted]) {
        expect(result).toEqual({ ok: false, error: expect.objectContaining({ kind: 'notFound' }) });
      }
      const mine = await snapshot(favoritesRepository);
      expect(mine.collections.find(({ id }) => id === 'food')?.name).toBe('Lisbon food');
      expect(mine.memberships).toHaveLength(1);
    });

    it("leaves this account's memberships alone when the other account removes the same collection and favorite ids", async () => {
      const { favoritesRepository } = await setup();
      await favoritesRepository.setMemberships(TRIP_OWNER, 'lisbon-fav', ['food', 'must-visit'], FAVORITES_NOW);

      await favoritesRepository.removeMembership(OTHER_TRIP_OWNER, 'must-visit', 'lisbon-fav');

      expect((await snapshot(favoritesRepository)).memberships.map(({ collectionId }) => collectionId).sort()).toEqual([
        'food',
        'must-visit',
      ]);
    });
  });

  it('refuses renaming or deleting a default collection at the storage level too', async () => {
    const { favoritesRepository } = await setup();

    const renamed = await favoritesRepository.renameCollection(TRIP_OWNER, 'must-visit', 'Renamed', FAVORITES_NOW);
    const deleted = await favoritesRepository.deleteCollection(TRIP_OWNER, 'must-visit');

    expect(renamed).toEqual({ ok: false, error: expect.objectContaining({ kind: 'notFound' }) });
    expect(deleted).toEqual({ ok: false, error: expect.objectContaining({ kind: 'notFound' }) });
    const mustVisit = (await snapshot(favoritesRepository)).collections.find(({ id }) => id === 'must-visit');
    expect(mustVisit).toMatchObject({ kind: 'default', name: null });
  });

  it('stores one membership when the same collection id is ticked twice', async () => {
    const { favoritesRepository } = await setup();

    const result = await favoritesRepository.setMemberships(
      TRIP_OWNER,
      'lisbon-fav',
      ['must-visit', 'must-visit', 'food', 'food'],
      FAVORITES_NOW + 5,
    );

    expect(result.ok).toBe(true);
    const memberships = (await snapshot(favoritesRepository)).memberships;
    expect(memberships.map(({ collectionId }) => collectionId).sort()).toEqual(['food', 'must-visit']);
  });

  it('removes every membership when no collection is ticked, keeping the place saved', async () => {
    const { favoritesRepository } = await setup();

    const result = await favoritesRepository.setMemberships(TRIP_OWNER, 'lisbon-fav', [], FAVORITES_NOW);

    expect(result.ok).toBe(true);
    const mine = await snapshot(favoritesRepository);
    expect(mine.memberships).toEqual([]);
    expect(mine.favorites.map(({ id }) => id)).toEqual(['lisbon-fav']);
  });

  it('reports removing a place from a collection it is not in', async () => {
    const { favoritesRepository } = await setup();

    const result = await favoritesRepository.removeMembership(TRIP_OWNER, 'must-visit', 'lisbon-fav');

    expect(result).toEqual({ ok: false, error: expect.objectContaining({ kind: 'notFound' }) });
  });

  it('round-trips names in other scripts, emoji and very long text exactly', async () => {
    const { favoritesRepository } = await setup();
    const longAddress = `${'Rua Augusta '.repeat(200)}1100-053 Lisboa`;
    const unusual = favorite({
      id: 'tokyo-fav',
      targetId: 'place-東京',
      name: '東京タワー 🗼',
      subtitle: 'Ğüçlü — ﻣﺼﺮ',
      address: longAddress,
      savedAt: FAVORITES_NOW + 1,
    });

    await favoritesRepository.insertFavorite(TRIP_OWNER, unusual);
    const renamed = await favoritesRepository.renameCollection(TRIP_OWNER, 'food', 'Comida 🍕 çà', FAVORITES_NOW);

    const mine = await snapshot(favoritesRepository);
    expect(mine.favorites[0]).toEqual(unusual);
    expect(renamed.ok).toBe(true);
    expect(mine.collections.find(({ id }) => id === 'food')?.name).toBe('Comida 🍕 çà');
  });

  it('keeps a place with no position (neither latitude nor longitude)', async () => {
    const { favoritesRepository } = await setup();
    const noPosition = favorite({ id: 'pt-fav', targetId: 'country-pt', latitude: null, longitude: null });

    const result = await favoritesRepository.insertFavorite(TRIP_OWNER, noPosition);

    expect(result).toEqual({ ok: true, value: noPosition });
  });

  it('treats target ids that differ only in case as different targets', async () => {
    const { favoritesRepository } = await setup();

    const result = await favoritesRepository.insertFavorite(
      TRIP_OWNER,
      favorite({ id: 'upper', targetId: 'LISBON', savedAt: FAVORITES_NOW + 1 }),
    );

    expect(result.ok && result.value.id).toBe('upper');
    expect((await snapshot(favoritesRepository)).favorites).toHaveLength(2);
  });
});
