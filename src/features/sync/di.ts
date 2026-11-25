import { type CoreDependencies } from '@/core/di/CoreDependencies';
import { type AppError } from '@/core/errors/AppError';
import { type Result } from '@/core/result';
import { type Factories } from '@/core/di/createContainer';
import { SyncEngine } from '@/core/sync/SyncEngine';
import { type SyncEntitySources, LocalOnlySyncGateway, type SyncGateway } from '@/core/sync/SyncGateway';
import { ExponentialSyncRetryPolicy, type SyncRetryPolicy } from '@/core/sync/SyncRetryPolicy';
import { type UseCase } from '@/core/usecase/UseCase';
import { type BudgetDependencies } from '@/features/budget/di';
import { type FavoritesDependencies } from '@/features/favorites/di';
import { type ItineraryDependencies } from '@/features/itinerary/di';
import { type TripsDependencies } from '@/features/trips/di';

import { createSyncEntitySources } from './data/syncEntitySources';
import { ClearSavedData, GetSavedDataSummary, type SavedDataSummary } from './domain/savedData';

export interface SyncDependencies {
  /** Where pending operations go. Local-only: Wanderly has no backend, so nothing leaves the device. */
  readonly syncGateway: SyncGateway;
  readonly syncRetryPolicy: SyncRetryPolicy;
  readonly syncEntitySources: SyncEntitySources;
  readonly syncEngine: SyncEngine;
  readonly getSavedDataSummary: UseCase<void, Result<SavedDataSummary, AppError>>;
  readonly clearSavedData: UseCase<void, Result<void, AppError>>;
}

type Needs = CoreDependencies &
  Pick<TripsDependencies, 'tripRepository' | 'tripOwnerProvider'> &
  Pick<ItineraryDependencies, 'activityRepository'> &
  Pick<BudgetDependencies, 'expenseRepository'> &
  Pick<FavoritesDependencies, 'favoritesRepository'> &
  SyncDependencies;

export const syncFactories: Factories<SyncDependencies, Needs> = {
  // A cloud backend replaces this one line with its own SyncGateway (see docs/ARCHITECTURE.md § 20).
  syncGateway: () => new LocalOnlySyncGateway(),
  syncRetryPolicy: () => new ExponentialSyncRetryPolicy(),
  syncEntitySources: (c) => createSyncEntitySources(c),
  syncEngine: (c) =>
    new SyncEngine({
      outbox: c.syncOutbox,
      changeLog: c.localChangeLog,
      gateway: c.syncGateway,
      sources: c.syncEntitySources,
      connectivity: c.connectivity,
      currentOwnerId: () => c.tripOwnerProvider.currentOwnerId(),
      clock: c.clock,
      retryPolicy: c.syncRetryPolicy,
      logger: c.logger.child({ scope: 'sync' }),
    }),
  getSavedDataSummary: (c) => new GetSavedDataSummary(c.cacheStore, c.logger.child({ scope: 'savedData' })),
  clearSavedData: (c) => new ClearSavedData(c.cacheStore, c.logger.child({ scope: 'savedData' })),
};
