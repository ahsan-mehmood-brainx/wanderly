import { AppError } from '@/core/errors/AppError';
import { err, ok, type Result } from '@/core/result';
import { type UseCase } from '@/core/usecase/UseCase';
import { type Clock } from '@/core/utils/Clock';
import { type IdGenerator } from '@/core/utils/IdGenerator';
import { type TripOwnerProvider } from '@/features/trips/domain/repositories';

import { type Collection, type CollectionMembership, isDefaultCollectionId } from '../Collection';
import { type CollectionNameError, validateCollectionName } from '../collectionValidation';
import { type Favorite, type FavoriteTarget } from '../Favorite';
import { type CollectionWriteOutcome, type FavoritesRepository, type FavoritesSnapshot } from '../repositories';

/** Why a collection name was refused: the name itself, or the account already has the most custom collections. */
export type CollectionValidationError = CollectionNameError | 'limitReached';

export type SaveCollectionOutcome =
  | { readonly status: 'saved'; readonly collection: Collection }
  /** Nothing was saved; the sheet shows this error. */
  | { readonly status: 'invalid'; readonly error: CollectionValidationError }
  /** Nothing was saved (`storage`, `notFound`, `forbidden` for a default collection, `unauthorized` when signed out). */
  | { readonly status: 'failed'; readonly error: AppError };

export interface RenameCollectionInput {
  readonly id: string;
  readonly name: string;
}

export interface SetFavoriteCollectionsInput {
  readonly favoriteId: string;
  readonly collectionIds: readonly string[];
}

export interface RemoveFromCollectionInput {
  readonly collectionId: string;
  readonly favoriteId: string;
}

/**
 * The account to act for, read once per operation so every step applies to the
 * same account even if the session changes meanwhile.
 */
function requireOwner(owners: TripOwnerProvider): Result<string, AppError> {
  const ownerId = owners.currentOwnerId();
  return ownerId === null ? err(new AppError('unauthorized', 'No signed-in account for favorites')) : ok(ownerId);
}

const defaultCollectionForbidden = (id: string) =>
  new AppError('forbidden', `Default collection ${id} can't be renamed or deleted`);

/** Creates the default collections on first use, then loads everything the account saved. */
export class GetFavorites implements UseCase<void, Result<FavoritesSnapshot, AppError>> {
  constructor(
    private readonly favorites: FavoritesRepository,
    private readonly owners: TripOwnerProvider,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<Result<FavoritesSnapshot, AppError>> {
    const owner = requireOwner(this.owners);
    if (!owner.ok) return owner;
    const seeded = await this.favorites.ensureDefaultCollections(owner.value, this.clock.now());
    if (!seeded.ok) return seeded;
    return this.favorites.loadAll(owner.value);
  }
}

/** Saves a target once: saving it again returns the favorite already stored. */
export class SaveFavorite implements UseCase<FavoriteTarget, Result<Favorite, AppError>> {
  constructor(
    private readonly favorites: FavoritesRepository,
    private readonly owners: TripOwnerProvider,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
  ) {}

  async execute(target: FavoriteTarget): Promise<Result<Favorite, AppError>> {
    const owner = requireOwner(this.owners);
    if (!owner.ok) return owner;
    const existing = await this.favorites.findByTarget(owner.value, target.targetId);
    if (!existing.ok) return existing;
    if (existing.value) return ok(existing.value);
    // The repository also returns the stored favorite when a concurrent save got there first.
    return this.favorites.insertFavorite(owner.value, {
      id: this.idGenerator(),
      ...target,
      savedAt: this.clock.now(),
    });
  }
}

/** Unsaves a favorite (by its id) and drops it from every collection. */
export class RemoveFavorite implements UseCase<string, Result<void, AppError>> {
  constructor(
    private readonly favorites: FavoritesRepository,
    private readonly owners: TripOwnerProvider,
  ) {}

  async execute(favoriteId: string): Promise<Result<void, AppError>> {
    const owner = requireOwner(this.owners);
    if (!owner.ok) return owner;
    return this.favorites.deleteFavorite(owner.value, favoriteId);
  }
}

export class CreateCollection implements UseCase<string, SaveCollectionOutcome> {
  constructor(
    private readonly favorites: FavoritesRepository,
    private readonly owners: TripOwnerProvider,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
  ) {}

  async execute(name: string): Promise<SaveCollectionOutcome> {
    const owner = requireOwner(this.owners);
    if (!owner.ok) return { status: 'failed', error: owner.error };
    // The name itself; uniqueness and the limit are checked by the repository with the write.
    const validation = validateCollectionName(name, []);
    if (!validation.ok) return { status: 'invalid', error: validation.error };

    const now = this.clock.now();
    const collection: Collection = {
      id: this.idGenerator(),
      kind: 'custom',
      defaultKey: null,
      name: validation.name,
      createdAt: now,
      updatedAt: now,
    };
    const saved = await this.favorites.insertCollection(owner.value, collection);
    return toSaveCollectionOutcome(saved);
  }
}

/** Renames a custom collection; default collections are `forbidden`. */
export class RenameCollection implements UseCase<RenameCollectionInput, SaveCollectionOutcome> {
  constructor(
    private readonly favorites: FavoritesRepository,
    private readonly owners: TripOwnerProvider,
    private readonly clock: Clock,
  ) {}

  async execute({ id, name }: RenameCollectionInput): Promise<SaveCollectionOutcome> {
    const owner = requireOwner(this.owners);
    if (!owner.ok) return { status: 'failed', error: owner.error };
    if (isDefaultCollectionId(id)) return { status: 'failed', error: defaultCollectionForbidden(id) };
    // The name itself; uniqueness is checked by the repository with the write.
    const validation = validateCollectionName(name, []);
    if (!validation.ok) return { status: 'invalid', error: validation.error };

    const saved = await this.favorites.renameCollection(owner.value, id, validation.name, this.clock.now());
    return toSaveCollectionOutcome(saved);
  }
}

function toSaveCollectionOutcome(saved: Result<CollectionWriteOutcome, AppError>): SaveCollectionOutcome {
  if (!saved.ok) return { status: 'failed', error: saved.error };
  if (saved.value.status === 'refused') return { status: 'invalid', error: saved.value.reason };
  return { status: 'saved', collection: saved.value.collection };
}

/** Deletes a custom collection and its memberships; default collections are `forbidden`. */
export class DeleteCollection implements UseCase<string, Result<void, AppError>> {
  constructor(
    private readonly favorites: FavoritesRepository,
    private readonly owners: TripOwnerProvider,
  ) {}

  async execute(id: string): Promise<Result<void, AppError>> {
    const owner = requireOwner(this.owners);
    if (!owner.ok) return owner;
    if (isDefaultCollectionId(id)) return err(defaultCollectionForbidden(id));
    return this.favorites.deleteCollection(owner.value, id);
  }
}

/** Makes `collectionIds` exactly the favorite's collections and returns its memberships. */
export class SetFavoriteCollections implements UseCase<
  SetFavoriteCollectionsInput,
  Result<readonly CollectionMembership[], AppError>
> {
  constructor(
    private readonly favorites: FavoritesRepository,
    private readonly owners: TripOwnerProvider,
    private readonly clock: Clock,
  ) {}

  async execute({
    favoriteId,
    collectionIds,
  }: SetFavoriteCollectionsInput): Promise<Result<readonly CollectionMembership[], AppError>> {
    const owner = requireOwner(this.owners);
    if (!owner.ok) return owner;
    return this.favorites.setMemberships(owner.value, favoriteId, collectionIds, this.clock.now());
  }
}

/** Takes a favorite out of one collection; it stays saved. */
export class RemoveFromCollection implements UseCase<RemoveFromCollectionInput, Result<void, AppError>> {
  constructor(
    private readonly favorites: FavoritesRepository,
    private readonly owners: TripOwnerProvider,
  ) {}

  async execute({ collectionId, favoriteId }: RemoveFromCollectionInput): Promise<Result<void, AppError>> {
    const owner = requireOwner(this.owners);
    if (!owner.ok) return owner;
    return this.favorites.removeMembership(owner.value, collectionId, favoriteId);
  }
}
