export const DEFAULT_COLLECTION_KEYS = [
  'wantToVisit',
  'mustVisit',
  'favoriteRestaurants',
  'favoriteAttractions',
] as const;
export type DefaultCollectionKey = (typeof DEFAULT_COLLECTION_KEYS)[number];

/** The collections every account has, with fixed route-safe ids. Their names come from i18n. */
export const DEFAULT_COLLECTIONS: readonly { readonly id: string; readonly key: DefaultCollectionKey }[] = [
  { id: 'want-to-visit', key: 'wantToVisit' },
  { id: 'must-visit', key: 'mustVisit' },
  { id: 'favorite-restaurants', key: 'favoriteRestaurants' },
  { id: 'favorite-attractions', key: 'favoriteAttractions' },
];

export type CollectionKind = 'default' | 'custom';

export interface Collection {
  readonly id: string;
  readonly kind: CollectionKind;
  /** Set for default collections only. */
  readonly defaultKey: DefaultCollectionKey | null;
  /** Set for custom collections only (1 to {@link MAX_COLLECTION_NAME} characters). */
  readonly name: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** A saved place in a collection. A place can be in any number of collections. */
export interface CollectionMembership {
  readonly collectionId: string;
  readonly favoriteId: string;
  readonly addedAt: number;
}

export const MAX_COLLECTION_NAME = 40;
export const MAX_CUSTOM_COLLECTIONS = 50;

export function isDefaultCollectionId(id: string): boolean {
  return DEFAULT_COLLECTIONS.some((item) => item.id === id);
}

const listPosition = (collection: Collection) =>
  collection.kind === 'default'
    ? DEFAULT_COLLECTIONS.findIndex(({ id }) => id === collection.id)
    : DEFAULT_COLLECTIONS.length;

/** Default collections in `DEFAULT_COLLECTIONS` order, then custom ones oldest first. */
export function compareCollections(a: Collection, b: Collection): number {
  return listPosition(a) - listPosition(b) || a.createdAt - b.createdAt || a.id.localeCompare(b.id);
}
