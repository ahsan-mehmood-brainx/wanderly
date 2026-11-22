import { ok, type Result } from '@/core/result';
import { type AppError } from '@/core/errors/AppError';
import { type SyncEntitySources } from '@/core/sync/SyncGateway';
import { EXPENSE_SYNC_ENTITY } from '@/features/budget/data/LocalExpenseRepository';
import { type ExpenseRepository } from '@/features/budget/domain/repositories';
import { COLLECTION_SYNC_ENTITY, FAVORITE_SYNC_ENTITY } from '@/features/favorites/data/LocalFavoritesRepository';
import { type FavoritesRepository } from '@/features/favorites/domain/repositories';
import { ACTIVITY_SYNC_ENTITY } from '@/features/itinerary/data/LocalActivityRepository';
import { type ActivityRepository } from '@/features/itinerary/domain/repositories';
import { TRIP_SYNC_ENTITY } from '@/features/trips/data/LocalTripRepository';
import { type TripRepository } from '@/features/trips/domain/repositories';

export interface SyncSourceRepositories {
  readonly tripRepository: Pick<TripRepository, 'findById'>;
  readonly activityRepository: Pick<ActivityRepository, 'findById'>;
  readonly expenseRepository: Pick<ExpenseRepository, 'findById'>;
  readonly favoritesRepository: Pick<FavoritesRepository, 'loadAll'>;
}

/**
 * How the sync engine reads each entity type's current state for a push. A favorite
 * is pushed with its collection memberships, which are part of its state.
 */
export function createSyncEntitySources(repositories: SyncSourceRepositories): SyncEntitySources {
  const favoritesSnapshot = (ownerId: string) => repositories.favoritesRepository.loadAll(ownerId);
  return {
    [TRIP_SYNC_ENTITY]: (ownerId, id) => repositories.tripRepository.findById(ownerId, id),
    [ACTIVITY_SYNC_ENTITY]: (ownerId, id) => repositories.activityRepository.findById(ownerId, id),
    [EXPENSE_SYNC_ENTITY]: (ownerId, id) => repositories.expenseRepository.findById(ownerId, id),
    [FAVORITE_SYNC_ENTITY]: async (ownerId, id): Promise<Result<unknown, AppError>> => {
      const snapshot = await favoritesSnapshot(ownerId);
      if (!snapshot.ok) return snapshot;
      const favorite = snapshot.value.favorites.find((item) => item.id === id);
      if (!favorite) return ok(null);
      const collectionIds = snapshot.value.memberships
        .filter((membership) => membership.favoriteId === id)
        .map((membership) => membership.collectionId);
      return ok({ ...favorite, collectionIds });
    },
    [COLLECTION_SYNC_ENTITY]: async (ownerId, id): Promise<Result<unknown, AppError>> => {
      const snapshot = await favoritesSnapshot(ownerId);
      if (!snapshot.ok) return snapshot;
      return ok(snapshot.value.collections.find((item) => item.id === id) ?? null);
    },
  };
}
