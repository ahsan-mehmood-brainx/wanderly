import { AppError } from '@/core/errors/AppError';
import { err } from '@/core/result';
import {
  customCollection,
  DEFAULT_COLLECTION_IDS,
  favorite,
  favoriteTarget,
  FAVORITES_NOW,
  restaurantFavorite,
  seededFavoritesDatabase,
} from '@/testing/favoritesFixtures';
import { ManualClock, sequentialIds } from '@/testing/ManualClock';
import { FakeTripOwnerProvider, OTHER_TRIP_OWNER, TRIP_OWNER } from '@/testing/tripFixtures';

import { type Collection, type CollectionMembership } from '../Collection';
import { type Favorite } from '../Favorite';
import { type FavoritesRepository } from '../repositories';
import {
  CreateCollection,
  DeleteCollection,
  GetFavorites,
  RemoveFavorite,
  RemoveFromCollection,
  RenameCollection,
  SaveFavorite,
  SetFavoriteCollections,
} from './favoriteUseCases';

const storageFailure = () => err(new AppError('storage', 'disk full'));

const lisbon = favorite({ id: 'lisbon-fav' });
const julesVerne = restaurantFavorite({ id: 'jules-verne', savedAt: FAVORITES_NOW + 1 });
const food = customCollection({ id: 'food', name: 'Lisbon food' });

interface SetupOptions {
  readonly favorites?: readonly Favorite[];
  readonly collections?: readonly Collection[];
  readonly memberships?: readonly Pick<CollectionMembership, 'collectionId' | 'favoriteId'>[];
  readonly defaults?: boolean;
}

async function setup(options: SetupOptions = {}) {
  const { favoritesRepository } = await seededFavoritesDatabase(options);
  const repository: FavoritesRepository = favoritesRepository;
  const clock = new ManualClock(FAVORITES_NOW);
  const owners = new FakeTripOwnerProvider();
  return {
    repository,
    clock,
    owners,
    getFavorites: new GetFavorites(repository, owners, clock),
    save: new SaveFavorite(repository, owners, clock, sequentialIds('fav')),
    remove: new RemoveFavorite(repository, owners),
    create: new CreateCollection(repository, owners, clock, sequentialIds('col')),
    rename: new RenameCollection(repository, owners, clock),
    deleteCollection: new DeleteCollection(repository, owners),
    setCollections: new SetFavoriteCollections(repository, owners, clock),
    removeFromCollection: new RemoveFromCollection(repository, owners),
  };
}

async function stored(repository: FavoritesRepository, ownerId = TRIP_OWNER) {
  const result = await repository.loadAll(ownerId);
  if (!result.ok) throw result.error;
  return result.value;
}

describe('GetFavorites', () => {
  it('AC3 creates the four default collections on the first load', async () => {
    const { getFavorites } = await setup({ defaults: false });

    const result = await getFavorites.execute();

    expect(result.ok && result.value.collections).toEqual(
      DEFAULT_COLLECTION_IDS.map((id) =>
        expect.objectContaining({ id, kind: 'default', name: null, createdAt: FAVORITES_NOW }),
      ),
    );
  });

  it('AC3 never duplicates the default collections on later loads', async () => {
    const { getFavorites, repository, clock } = await setup({ defaults: false });

    await getFavorites.execute();
    clock.advance(60_000);
    const again = await getFavorites.execute();

    expect(again.ok && again.value.collections.map(({ id }) => id)).toEqual(DEFAULT_COLLECTION_IDS);
    expect((await stored(repository)).collections).toHaveLength(4);
  });

  it('AC9 returns saved places newest first, collections and memberships', async () => {
    const { getFavorites } = await setup({
      favorites: [lisbon, julesVerne],
      collections: [food],
      memberships: [{ collectionId: 'food', favoriteId: 'jules-verne' }],
    });

    const result = await getFavorites.execute();

    expect(result.ok && result.value.favorites.map(({ id }) => id)).toEqual(['jules-verne', 'lisbon-fav']);
    expect(result.ok && result.value.collections.map(({ id }) => id)).toEqual([...DEFAULT_COLLECTION_IDS, 'food']);
    expect(result.ok && result.value.memberships).toEqual([
      { collectionId: 'food', favoriteId: 'jules-verne', addedAt: FAVORITES_NOW },
    ]);
  });

  it('AC8 passes on a storage failure', async () => {
    const { getFavorites, repository } = await setup();
    jest.spyOn(repository, 'loadAll').mockResolvedValueOnce(storageFailure());
    const result = await getFavorites.execute();
    expect(!result.ok && result.error.kind).toBe('storage');
  });
});

describe('SaveFavorite', () => {
  it('AC2 saves the target with a generated id and the current time', async () => {
    const { save, repository } = await setup();

    const result = await save.execute(favoriteTarget());

    expect(result).toEqual({ ok: true, value: { id: 'fav-1', ...favoriteTarget(), savedAt: FAVORITES_NOW } });
    expect((await stored(repository)).favorites).toEqual([result.ok && result.value]);
  });

  it('AC1 returns the same favorite when the target is saved twice, keeping one record', async () => {
    const { save, repository, clock } = await setup();

    const first = await save.execute(favoriteTarget());
    clock.advance(1_000);
    const second = await save.execute(favoriteTarget({ name: 'Lisboa' }));

    expect(second).toEqual(first);
    expect((await stored(repository)).favorites).toHaveLength(1);
  });

  it('AC1 keeps one record when two saves of the same target run at once', async () => {
    const { save, repository } = await setup();

    const [first, second] = await Promise.all([
      save.execute(favoriteTarget({ targetId: 'osm:node/102' })),
      save.execute(favoriteTarget({ targetId: 'osm:node/102' })),
    ]);

    expect(first.ok && second.ok && first.value.id === second.value.id).toBe(true);
    expect((await stored(repository)).favorites).toHaveLength(1);
  });

  it('AC2 saves different targets separately', async () => {
    const { save, repository } = await setup();
    await save.execute(favoriteTarget());
    await save.execute(favoriteTarget({ targetId: 'country-pt', category: 'country', name: 'Portugal' }));
    expect((await stored(repository)).favorites).toHaveLength(2);
  });

  it('passes on a storage failure', async () => {
    const { save, repository } = await setup();
    jest.spyOn(repository, 'insertFavorite').mockResolvedValueOnce(storageFailure());
    const result = await save.execute(favoriteTarget());
    expect(!result.ok && result.error.kind).toBe('storage');
  });
});

describe('RemoveFavorite', () => {
  it('AC2 removes the favorite and all of its collection memberships', async () => {
    const { remove, repository } = await setup({
      favorites: [lisbon, julesVerne],
      collections: [food],
      memberships: [
        { collectionId: 'food', favoriteId: 'jules-verne' },
        { collectionId: 'must-visit', favoriteId: 'jules-verne' },
      ],
    });

    await expect(remove.execute('jules-verne')).resolves.toEqual({ ok: true, value: undefined });

    const after = await stored(repository);
    expect(after.favorites.map(({ id }) => id)).toEqual(['lisbon-fav']);
    expect(after.memberships).toEqual([]);
  });

  it('reports a favorite that is already gone', async () => {
    const { remove } = await setup();
    const result = await remove.execute('gone');
    expect(!result.ok && result.error.kind).toBe('notFound');
  });
});

describe('CreateCollection', () => {
  it('AC4 saves a custom collection with a trimmed name', async () => {
    const { create, repository } = await setup();

    const outcome = await create.execute('  Lisbon food ');

    expect(outcome).toEqual({
      status: 'saved',
      collection: {
        id: 'col-1',
        kind: 'custom',
        defaultKey: null,
        name: 'Lisbon food',
        createdAt: FAVORITES_NOW,
        updatedAt: FAVORITES_NOW,
      },
    });
    expect((await stored(repository)).collections.map(({ id }) => id)).toEqual([...DEFAULT_COLLECTION_IDS, 'col-1']);
  });

  it.each([
    ['an empty name', '   ', 'required'],
    ['a name over 40 characters', 'x'.repeat(41), 'tooLong'],
    ['the name of another custom collection', 'LISBON FOOD', 'duplicate'],
  ])('AC4 refuses %s and saves nothing', async (_label, name, error) => {
    const { create, repository } = await setup({ collections: [food] });

    expect(await create.execute(name)).toEqual({ status: 'invalid', error });
    expect((await stored(repository)).collections).toHaveLength(5);
  });

  it('AC4 refuses a 51st custom collection', async () => {
    const fifty = Array.from({ length: 50 }, (_, index) =>
      customCollection({ id: `c${index}`, name: `Collection ${index}`, createdAt: FAVORITES_NOW + index }),
    );
    const { create, repository } = await setup({ collections: fifty });

    expect(await create.execute('One more')).toEqual({ status: 'invalid', error: 'limitReached' });
    expect((await stored(repository)).collections).toHaveLength(54);
  });

  it('passes on a storage failure', async () => {
    const { create, repository } = await setup();
    jest.spyOn(repository, 'insertCollection').mockResolvedValueOnce(storageFailure());
    const outcome = await create.execute('Lisbon food');
    expect(outcome.status === 'failed' && outcome.error.kind).toBe('storage');
  });
});

describe('RenameCollection', () => {
  const museums = customCollection({ id: 'museums', name: 'Museums', createdAt: FAVORITES_NOW + 1 });

  it('AC5 renames a custom collection, keeping createdAt and moving updatedAt', async () => {
    const { rename, repository, clock } = await setup({ collections: [food] });
    clock.advance(5_000);

    const outcome = await rename.execute({ id: 'food', name: ' Porto food ' });

    expect(outcome).toEqual({
      status: 'saved',
      collection: { ...food, name: 'Porto food', updatedAt: FAVORITES_NOW + 5_000 },
    });
    expect((await stored(repository)).collections.find(({ id }) => id === 'food')?.name).toBe('Porto food');
  });

  it('AC5 lets a collection change only the case of its own name', async () => {
    const { rename } = await setup({ collections: [food] });
    await expect(rename.execute({ id: 'food', name: 'LISBON FOOD' })).resolves.toMatchObject({ status: 'saved' });
  });

  it.each([
    ['an empty name', '', 'required'],
    ['a name over 40 characters', 'y'.repeat(41), 'tooLong'],
    ["another collection's name", 'museums', 'duplicate'],
  ])('AC5 refuses %s and changes nothing', async (_label, name, error) => {
    const { rename, repository } = await setup({ collections: [food, museums] });

    expect(await rename.execute({ id: 'food', name })).toEqual({ status: 'invalid', error });
    expect((await stored(repository)).collections.find(({ id }) => id === 'food')?.name).toBe('Lisbon food');
  });

  it('AC3 refuses renaming a default collection and changes nothing', async () => {
    const { rename, repository } = await setup();

    const outcome = await rename.execute({ id: 'must-visit', name: 'Maybe' });

    expect(outcome.status === 'failed' && outcome.error.kind).toBe('forbidden');
    expect((await stored(repository)).collections.find(({ id }) => id === 'must-visit')).toMatchObject({
      kind: 'default',
      name: null,
    });
  });

  it('reports a collection that does not exist', async () => {
    const { rename } = await setup();
    const outcome = await rename.execute({ id: 'gone', name: 'Anything' });
    expect(outcome.status === 'failed' && outcome.error.kind).toBe('notFound');
  });
});

describe('DeleteCollection', () => {
  it('AC5 deletes a custom collection and its memberships, keeping the places saved', async () => {
    const { deleteCollection, repository } = await setup({
      favorites: [lisbon, julesVerne],
      collections: [food],
      memberships: [
        { collectionId: 'food', favoriteId: 'jules-verne' },
        { collectionId: 'must-visit', favoriteId: 'jules-verne' },
      ],
    });

    await expect(deleteCollection.execute('food')).resolves.toEqual({ ok: true, value: undefined });

    const after = await stored(repository);
    expect(after.collections.map(({ id }) => id)).toEqual(DEFAULT_COLLECTION_IDS);
    expect(after.favorites.map(({ id }) => id)).toEqual(['jules-verne', 'lisbon-fav']);
    expect(after.memberships.map(({ collectionId }) => collectionId)).toEqual(['must-visit']);
  });

  it('AC3 refuses deleting a default collection and changes nothing', async () => {
    const { deleteCollection, repository } = await setup({
      favorites: [julesVerne],
      memberships: [{ collectionId: 'want-to-visit', favoriteId: 'jules-verne' }],
    });

    const result = await deleteCollection.execute('want-to-visit');

    expect(!result.ok && result.error.kind).toBe('forbidden');
    const after = await stored(repository);
    expect(after.collections.map(({ id }) => id)).toEqual(DEFAULT_COLLECTION_IDS);
    expect(after.memberships).toHaveLength(1);
  });

  it('reports a collection that does not exist', async () => {
    const { deleteCollection } = await setup();
    const result = await deleteCollection.execute('gone');
    expect(!result.ok && result.error.kind).toBe('notFound');
  });
});

describe('SetFavoriteCollections', () => {
  it('AC6 puts a place in every ticked collection and returns its memberships', async () => {
    const { setCollections } = await setup({ favorites: [julesVerne], collections: [food] });

    const result = await setCollections.execute({ favoriteId: 'jules-verne', collectionIds: ['must-visit', 'food'] });

    expect(result.ok && [...result.value].sort((a, b) => a.collectionId.localeCompare(b.collectionId))).toEqual([
      { collectionId: 'food', favoriteId: 'jules-verne', addedAt: FAVORITES_NOW },
      { collectionId: 'must-visit', favoriteId: 'jules-verne', addedAt: FAVORITES_NOW },
    ]);
  });

  it('AC6 creates no second membership for a collection the place is already in', async () => {
    const { setCollections, repository, clock } = await setup({
      favorites: [julesVerne],
      memberships: [{ collectionId: 'must-visit', favoriteId: 'jules-verne' }],
    });
    clock.advance(1_000);

    await setCollections.execute({ favoriteId: 'jules-verne', collectionIds: ['must-visit', 'must-visit'] });

    expect((await stored(repository)).memberships).toEqual([
      { collectionId: 'must-visit', favoriteId: 'jules-verne', addedAt: FAVORITES_NOW },
    ]);
  });

  it('AC6 removes the place from unticked collections, but keeps it saved', async () => {
    const { setCollections, repository } = await setup({
      favorites: [julesVerne],
      memberships: [{ collectionId: 'must-visit', favoriteId: 'jules-verne' }],
    });

    await setCollections.execute({ favoriteId: 'jules-verne', collectionIds: [] });

    const after = await stored(repository);
    expect(after.memberships).toEqual([]);
    expect(after.favorites.map(({ id }) => id)).toEqual(['jules-verne']);
  });

  it.each([
    ['a favorite that does not exist', { favoriteId: 'gone', collectionIds: ['must-visit'] }],
    ['a collection that does not exist', { favoriteId: 'jules-verne', collectionIds: ['must-visit', 'gone'] }],
  ])('AC6 reports %s and changes nothing', async (_label, input) => {
    const { setCollections, repository } = await setup({ favorites: [julesVerne] });

    const result = await setCollections.execute(input);

    expect(!result.ok && result.error.kind).toBe('notFound');
    expect((await stored(repository)).memberships).toEqual([]);
  });
});

describe('RemoveFromCollection', () => {
  it('AC6 takes a place out of one collection without unsaving it', async () => {
    const { removeFromCollection, repository } = await setup({
      favorites: [julesVerne],
      collections: [food],
      memberships: [
        { collectionId: 'food', favoriteId: 'jules-verne' },
        { collectionId: 'must-visit', favoriteId: 'jules-verne' },
      ],
    });

    await expect(removeFromCollection.execute({ collectionId: 'food', favoriteId: 'jules-verne' })).resolves.toEqual({
      ok: true,
      value: undefined,
    });

    const after = await stored(repository);
    expect(after.memberships.map(({ collectionId }) => collectionId)).toEqual(['must-visit']);
    expect(after.favorites.map(({ id }) => id)).toEqual(['jules-verne']);
  });
});

describe('favorites ownership', () => {
  it("AC9 shows a second account none of the first account's places or collections", async () => {
    const { getFavorites, owners } = await setup({
      favorites: [lisbon],
      collections: [food],
      memberships: [{ collectionId: 'food', favoriteId: 'lisbon-fav' }],
    });
    owners.ownerId = OTHER_TRIP_OWNER;

    const result = await getFavorites.execute();

    expect(result.ok && result.value.favorites).toEqual([]);
    expect(result.ok && result.value.collections.map(({ id }) => id)).toEqual(DEFAULT_COLLECTION_IDS);
    expect(result.ok && result.value.memberships).toEqual([]);
  });

  it("AC9 can't change or delete another account's data", async () => {
    const { remove, rename, deleteCollection, setCollections, owners, repository } = await setup({
      favorites: [lisbon],
      collections: [food],
    });
    owners.ownerId = OTHER_TRIP_OWNER;

    expect(await rename.execute({ id: 'food', name: 'Taken' })).toMatchObject({
      status: 'failed',
      error: { kind: 'notFound' },
    });
    for (const result of [
      await remove.execute('lisbon-fav'),
      await deleteCollection.execute('food'),
      await setCollections.execute({ favoriteId: 'lisbon-fav', collectionIds: ['must-visit'] }),
    ]) {
      expect(!result.ok && result.error.kind).toBe('notFound');
    }
    const mine = await stored(repository, TRIP_OWNER);
    expect(mine.favorites).toEqual([lisbon]);
    expect(mine.collections.find(({ id }) => id === 'food')?.name).toBe('Lisbon food');
  });

  it('refuses every operation when nobody is signed in', async () => {
    const all = await setup({ favorites: [lisbon], collections: [food] });
    all.owners.ownerId = null;

    const failure = { status: 'failed', error: { kind: 'unauthorized' } };
    expect(await all.create.execute('New')).toMatchObject(failure);
    expect(await all.rename.execute({ id: 'food', name: 'New' })).toMatchObject(failure);
    for (const result of [
      await all.getFavorites.execute(),
      await all.save.execute(favoriteTarget({ targetId: 'country-pt' })),
      await all.remove.execute('lisbon-fav'),
      await all.deleteCollection.execute('food'),
      await all.setCollections.execute({ favoriteId: 'lisbon-fav', collectionIds: ['must-visit'] }),
      await all.removeFromCollection.execute({ collectionId: 'food', favoriteId: 'lisbon-fav' }),
    ]) {
      expect(!result.ok && result.error.kind).toBe('unauthorized');
    }
    const mine = await stored(all.repository, TRIP_OWNER);
    expect(mine.favorites).toEqual([lisbon]);
    expect(mine.collections.map(({ id }) => id)).toEqual([...DEFAULT_COLLECTION_IDS, 'food']);
  });
});
