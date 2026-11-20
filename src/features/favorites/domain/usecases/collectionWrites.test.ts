import {
  customCollection,
  FAVORITES_NOW,
  restaurantFavorite,
  seededFavoritesDatabase,
} from '@/testing/favoritesFixtures';
import { ManualClock, sequentialIds } from '@/testing/ManualClock';
import { FakeTripOwnerProvider, TRIP_OWNER } from '@/testing/tripFixtures';

import { type Collection } from '../Collection';
import { type FavoritesRepository } from '../repositories';
import { CreateCollection, RenameCollection, SetFavoriteCollections } from './favoriteUseCases';

const julesVerne = restaurantFavorite({ id: 'jules-verne' });
const food = customCollection({ id: 'food', name: 'Lisbon food' });
const museums = customCollection({ id: 'museums', name: 'Museums', createdAt: FAVORITES_NOW + 1 });

async function setup(collections: readonly Collection[] = []) {
  const { favoritesRepository } = await seededFavoritesDatabase({ favorites: [julesVerne], collections });
  const repository: FavoritesRepository = favoritesRepository;
  const clock = new ManualClock(FAVORITES_NOW);
  const owners = new FakeTripOwnerProvider();
  return {
    repository,
    create: new CreateCollection(repository, owners, clock, sequentialIds('col')),
    rename: new RenameCollection(repository, owners, clock),
    setCollections: new SetFavoriteCollections(repository, owners, clock),
  };
}

async function customNames(repository: FavoritesRepository) {
  const result = await repository.loadAll(TRIP_OWNER);
  if (!result.ok) throw result.error;
  return result.value.collections.filter(({ kind }) => kind === 'custom').map(({ name }) => name);
}

describe('collection writes run their checks with the write', () => {
  it('keeps one collection when two creates of the same name (any case) run at once', async () => {
    const { create, repository } = await setup();

    const outcomes = await Promise.all([create.execute('Lisbon food'), create.execute('LISBON FOOD')]);

    expect(outcomes.map(({ status }) => status).sort()).toEqual(['invalid', 'saved']);
    expect(outcomes).toContainEqual({ status: 'invalid', error: 'duplicate' });
    expect(await customNames(repository)).toHaveLength(1);
  });

  it('never goes past the custom collection limit when two creates run at once', async () => {
    const fortyNine = Array.from({ length: 49 }, (_, index) =>
      customCollection({ id: `c${index}`, name: `Collection ${index}`, createdAt: FAVORITES_NOW + index }),
    );
    const { create, repository } = await setup(fortyNine);

    const outcomes = await Promise.all([create.execute('One more'), create.execute('And another')]);

    expect(outcomes).toContainEqual({ status: 'invalid', error: 'limitReached' });
    expect(await customNames(repository)).toHaveLength(50);
  });

  it('keeps names unique when a rename and a create of the same name run at once', async () => {
    const { create, rename, repository } = await setup([food]);

    const [renamed, created] = await Promise.all([
      rename.execute({ id: 'food', name: 'Museums' }),
      create.execute('museums'),
    ]);

    expect([renamed.status, created.status].sort()).toEqual(['invalid', 'saved']);
    const names = (await customNames(repository)).map((name) => name?.toLowerCase());
    expect(names.filter((name) => name === 'museums')).toHaveLength(1);
  });

  it('refuses renaming to the name of another collection in the repository too', async () => {
    const { repository } = await setup([food, museums]);

    const result = await repository.renameCollection(TRIP_OWNER, 'food', 'MUSEUMS', FAVORITES_NOW + 5);

    expect(result).toEqual({ ok: true, value: { status: 'refused', reason: 'duplicate' } });
    expect(await customNames(repository)).toEqual(['Lisbon food', 'Museums']);
  });

  it('creates, renames and sets collections without loading every saved place', async () => {
    const { create, rename, setCollections, repository } = await setup([food]);
    const loadAll = jest.spyOn(repository, 'loadAll');

    await expect(create.execute('Museums')).resolves.toMatchObject({ status: 'saved' });
    await expect(rename.execute({ id: 'food', name: 'Porto food' })).resolves.toMatchObject({
      status: 'saved',
      collection: { id: 'food', name: 'Porto food', updatedAt: FAVORITES_NOW },
    });
    const memberships = await setCollections.execute({ favoriteId: 'jules-verne', collectionIds: ['food'] });

    expect(memberships).toEqual({
      ok: true,
      value: [{ collectionId: 'food', favoriteId: 'jules-verne', addedAt: FAVORITES_NOW }],
    });
    expect(loadAll).not.toHaveBeenCalled();
  });
});
