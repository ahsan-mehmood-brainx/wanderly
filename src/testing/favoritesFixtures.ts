import { LocalFavoritesRepository } from '@/features/favorites/data/LocalFavoritesRepository';
import { type Collection, type CollectionMembership } from '@/features/favorites/domain/Collection';
import { type Favorite, type FavoriteTarget } from '@/features/favorites/domain/Favorite';

import { createTripStorage, TRIP_OWNER, TRIPS_NOW } from './tripFixtures';

/** Favorites share the trips clock and accounts (`TRIP_OWNER`, `OTHER_TRIP_OWNER`). */
export const FAVORITES_NOW = TRIPS_NOW;

export const DEFAULT_COLLECTION_IDS = ['want-to-visit', 'must-visit', 'favorite-restaurants', 'favorite-attractions'];

/** Lisbon, as saved from its destination screen. */
export function favoriteTarget(overrides: Partial<FavoriteTarget> = {}): FavoriteTarget {
  return {
    targetId: 'lisbon',
    category: 'destination',
    name: 'Lisbon',
    subtitle: 'Portugal',
    imageUrl: 'https://upload.wikimedia.org/Lisbon-320.jpg',
    flagEmoji: '🇵🇹',
    latitude: 38.7223,
    longitude: -9.1393,
    address: null,
    ...overrides,
  };
}

export function favorite(overrides: Partial<Favorite> = {}): Favorite {
  return {
    id: 'fav-1',
    ...favoriteTarget(),
    savedAt: FAVORITES_NOW,
    ...overrides,
  };
}

/** A map restaurant, as saved from the place sheet. */
export function restaurantFavorite(overrides: Partial<Favorite> = {}): Favorite {
  return favorite({
    id: 'fav-restaurant',
    targetId: 'osm:node/102',
    category: 'restaurant',
    name: 'Le Jules Verne',
    subtitle: 'Avenue Gustave Eiffel, Paris',
    address: 'Avenue Gustave Eiffel, Paris',
    imageUrl: null,
    flagEmoji: null,
    latitude: 48.8583,
    longitude: 2.2945,
    ...overrides,
  });
}

export function customCollection(overrides: Partial<Collection> = {}): Collection {
  return {
    id: 'col-1',
    kind: 'custom',
    defaultKey: null,
    name: 'Lisbon food',
    createdAt: FAVORITES_NOW,
    updatedAt: FAVORITES_NOW,
    ...overrides,
  };
}

/** Real in-memory SQLite with the favorites repository on it. */
export function createFavoritesStorage() {
  const storage = createTripStorage();
  return {
    ...storage,
    favoritesRepository: new LocalFavoritesRepository(storage.database, storage.logger),
  };
}

interface SeedOptions {
  readonly favorites?: readonly Favorite[];
  readonly collections?: readonly Collection[];
  readonly memberships?: readonly Pick<CollectionMembership, 'collectionId' | 'favoriteId'>[];
  /** Create the default collections first (as the first load does). */
  readonly defaults?: boolean;
  readonly ownerId?: string;
}

/** Storage already holding `favorites`, `collections` and `memberships`, all belonging to `ownerId`. */
export async function seededFavoritesDatabase({
  favorites = [],
  collections = [],
  memberships = [],
  defaults = true,
  ownerId = TRIP_OWNER,
}: SeedOptions = {}) {
  const storage = createFavoritesStorage();
  await seedFavorites(storage.favoritesRepository, { favorites, collections, memberships, defaults, ownerId });
  return storage;
}

export async function seedFavorites(
  repository: LocalFavoritesRepository,
  { favorites = [], collections = [], memberships = [], defaults = true, ownerId = TRIP_OWNER }: SeedOptions,
) {
  const check = (result: { ok: true } | { ok: false; error: Error }) => {
    if (!result.ok) throw result.error;
  };
  if (defaults) check(await repository.ensureDefaultCollections(ownerId, FAVORITES_NOW));
  for (const item of favorites) check(await repository.insertFavorite(ownerId, item));
  for (const item of collections) {
    const inserted = await repository.insertCollection(ownerId, item);
    check(inserted);
    if (inserted.ok && inserted.value.status === 'refused') {
      throw new Error(`Seeding collection ${item.id} was refused: ${inserted.value.reason}`);
    }
  }
  const byFavorite = new Map<string, string[]>();
  for (const { collectionId, favoriteId } of memberships) {
    byFavorite.set(favoriteId, [...(byFavorite.get(favoriteId) ?? []), collectionId]);
  }
  for (const [favoriteId, collectionIds] of byFavorite) {
    check(await repository.setMemberships(ownerId, favoriteId, collectionIds, FAVORITES_NOW));
  }
}
