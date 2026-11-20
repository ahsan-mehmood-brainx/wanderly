import { type CoreDependencies } from '@/core/di/CoreDependencies';
import { type Factories } from '@/core/di/createContainer';
import { type AppError } from '@/core/errors/AppError';
import { type Result } from '@/core/result';
import { type UseCase } from '@/core/usecase/UseCase';
import { type TripsDependencies } from '@/features/trips/di';

import { LocalFavoritesRepository } from './data/LocalFavoritesRepository';
import { type CollectionMembership } from './domain/Collection';
import { type Favorite, type FavoriteTarget } from './domain/Favorite';
import { type FavoritesRepository, type FavoritesSnapshot } from './domain/repositories';
import {
  CreateCollection,
  DeleteCollection,
  GetFavorites,
  RemoveFavorite,
  RemoveFromCollection,
  type RemoveFromCollectionInput,
  RenameCollection,
  type RenameCollectionInput,
  SaveFavorite,
  type SaveCollectionOutcome,
  SetFavoriteCollections,
  type SetFavoriteCollectionsInput,
} from './domain/usecases/favoriteUseCases';

export interface FavoritesDependencies {
  readonly favoritesRepository: FavoritesRepository;
  readonly getFavorites: UseCase<void, Result<FavoritesSnapshot, AppError>>;
  readonly saveFavorite: UseCase<FavoriteTarget, Result<Favorite, AppError>>;
  readonly removeFavorite: UseCase<string, Result<void, AppError>>;
  readonly createCollection: UseCase<string, SaveCollectionOutcome>;
  readonly renameCollection: UseCase<RenameCollectionInput, SaveCollectionOutcome>;
  readonly deleteCollection: UseCase<string, Result<void, AppError>>;
  readonly setFavoriteCollections: UseCase<
    SetFavoriteCollectionsInput,
    Result<readonly CollectionMembership[], AppError>
  >;
  readonly removeFromCollection: UseCase<RemoveFromCollectionInput, Result<void, AppError>>;
}

export const favoritesFactories: Factories<
  FavoritesDependencies,
  CoreDependencies & Pick<TripsDependencies, 'tripOwnerProvider'> & FavoritesDependencies
> = {
  favoritesRepository: (c) => new LocalFavoritesRepository(c.database, c.logger.child({ scope: 'favorites' })),
  getFavorites: (c) => new GetFavorites(c.favoritesRepository, c.tripOwnerProvider, c.clock),
  saveFavorite: (c) => new SaveFavorite(c.favoritesRepository, c.tripOwnerProvider, c.clock, c.idGenerator),
  removeFavorite: (c) => new RemoveFavorite(c.favoritesRepository, c.tripOwnerProvider),
  createCollection: (c) => new CreateCollection(c.favoritesRepository, c.tripOwnerProvider, c.clock, c.idGenerator),
  renameCollection: (c) => new RenameCollection(c.favoritesRepository, c.tripOwnerProvider, c.clock),
  deleteCollection: (c) => new DeleteCollection(c.favoritesRepository, c.tripOwnerProvider),
  setFavoriteCollections: (c) => new SetFavoriteCollections(c.favoritesRepository, c.tripOwnerProvider, c.clock),
  removeFromCollection: (c) => new RemoveFromCollection(c.favoritesRepository, c.tripOwnerProvider),
};
