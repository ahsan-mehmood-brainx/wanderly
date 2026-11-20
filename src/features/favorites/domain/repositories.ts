import { type AppError } from '@/core/errors/AppError';
import { type Result } from '@/core/result';

import { type Collection, type CollectionMembership } from './Collection';
import { type Favorite } from './Favorite';

export interface FavoritesSnapshot {
  /** Newest first. */
  readonly favorites: readonly Favorite[];
  /** Default collections in `DEFAULT_COLLECTIONS` order, then custom ones oldest first. */
  readonly collections: readonly Collection[];
  readonly memberships: readonly CollectionMembership[];
}

/**
 * What a custom collection write did. The checks behind `refused` (name already used
 * by another custom collection ignoring case, or the most custom collections an
 * account can have) run in the same transaction as the write, so they hold for any caller.
 */
export type CollectionWriteOutcome =
  | { readonly status: 'saved'; readonly collection: Collection }
  | { readonly status: 'refused'; readonly reason: 'duplicate' | 'limitReached' };

/**
 * Favorites and collections saved on the device, kept separately per account like
 * trips. Every operation takes the owner and only sees that owner's data, and works
 * offline. Failures are `storage` errors; changes to a missing favorite, collection
 * or membership are `notFound`.
 */
export interface FavoritesRepository {
  loadAll(ownerId: string): Promise<Result<FavoritesSnapshot, AppError>>;
  /** Creates the default collections the owner doesn't have yet. Safe to call any number of times. */
  ensureDefaultCollections(ownerId: string, now: number): Promise<Result<void, AppError>>;
  findByTarget(ownerId: string, targetId: string): Promise<Result<Favorite | null, AppError>>;
  /**
   * Saves `favorite` and returns what is stored. An owner saves each `targetId` once:
   * when it is already saved, the existing favorite is returned and nothing changes.
   */
  insertFavorite(ownerId: string, favorite: Favorite): Promise<Result<Favorite, AppError>>;
  /** Deletes the favorite and its collection memberships. */
  deleteFavorite(ownerId: string, favoriteId: string): Promise<Result<void, AppError>>;
  /** A custom collection is refused when its name is taken or the owner has `MAX_CUSTOM_COLLECTIONS`. */
  insertCollection(ownerId: string, collection: Collection): Promise<Result<CollectionWriteOutcome, AppError>>;
  /** Renames a custom collection (`notFound` otherwise); refused when another custom collection has the name. */
  renameCollection(
    ownerId: string,
    id: string,
    name: string,
    updatedAt: number,
  ): Promise<Result<CollectionWriteOutcome, AppError>>;
  /** Deletes the collection and its memberships; the favorites stay saved. */
  deleteCollection(ownerId: string, id: string): Promise<Result<void, AppError>>;
  /**
   * Makes `collectionIds` exactly the favorite's collections, in one transaction.
   * Memberships it already had keep their `addedAt`. Returns the favorite's memberships.
   */
  setMemberships(
    ownerId: string,
    favoriteId: string,
    collectionIds: readonly string[],
    now: number,
  ): Promise<Result<readonly CollectionMembership[], AppError>>;
  removeMembership(ownerId: string, collectionId: string, favoriteId: string): Promise<Result<void, AppError>>;
}
