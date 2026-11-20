import { createSelector } from '@reduxjs/toolkit';

import { type AppErrorKind } from '@/core/errors/AppError';
import { type RootState } from '@/core/store/store';

import { type Collection } from '../../domain/Collection';
import { type Favorite } from '../../domain/Favorite';
import { type FavoriteFilter, filterFavorites } from '../../domain/favoriteSearch';
import { collectionsSelectors, favoritesSelectors, type FavoritesLoadStatus } from './favoritesSlice';

export interface CollectionWithCount {
  readonly collection: Collection;
  readonly count: number;
}

export const selectFavoritesLoadStatus = (state: RootState): FavoritesLoadStatus => state.favorites.status;

export const selectFavoritesErrorKind = (state: RootState): AppErrorKind | null => state.favorites.errorKind;

export const selectFavoritesSaving = (state: RootState): boolean => state.favorites.changeRequestId !== null;

/** Newest first. */
export const selectAllFavorites = (state: RootState): readonly Favorite[] =>
  favoritesSelectors.selectAll(state.favorites.favorites);

const selectAllCollections = (state: RootState): readonly Collection[] =>
  collectionsSelectors.selectAll(state.favorites.collections);

const selectMemberships = (state: RootState) => state.favorites.memberships;

export const selectFavoriteById = (state: RootState, id: string): Favorite | undefined =>
  favoritesSelectors.selectById(state.favorites.favorites, id);

export const selectFavoriteByTargetId = createSelector(
  [selectAllFavorites, (_: RootState, targetId: string) => targetId],
  (favorites, targetId): Favorite | undefined => favorites.find((item) => item.targetId === targetId),
);

/** Newest first. */
export const selectFilteredFavorites = createSelector(
  [
    selectAllFavorites,
    (_: RootState, filter: FavoriteFilter) => filter.query,
    (_: RootState, filter: FavoriteFilter) => filter.category,
  ],
  (favorites, query, category): readonly Favorite[] => filterFavorites(favorites, { query, category }),
);

/** Default collections first, then custom ones oldest first, each with how many places it holds. */
export const selectCollectionsWithCounts = createSelector(
  [selectAllCollections, selectMemberships],
  (collections, memberships): readonly CollectionWithCount[] => {
    const counts = new Map<string, number>();
    for (const { collectionId } of memberships) counts.set(collectionId, (counts.get(collectionId) ?? 0) + 1);
    return collections.map((collection) => ({ collection, count: counts.get(collection.id) ?? 0 }));
  },
);

export const selectCollectionById = (state: RootState, id: string): Collection | undefined =>
  collectionsSelectors.selectById(state.favorites.collections, id);

/** The places in the collection, most recently added first. */
export const selectCollectionFavorites = createSelector(
  [selectAllFavorites, selectMemberships, (_: RootState, collectionId: string) => collectionId],
  (favorites, memberships, collectionId): readonly Favorite[] => {
    const addedAt = new Map(
      memberships.filter((item) => item.collectionId === collectionId).map((item) => [item.favoriteId, item.addedAt]),
    );
    // `favorites` is newest saved first; the stable sort keeps that order between places added together.
    return favorites
      .filter((item) => addedAt.has(item.id))
      .sort((a, b) => (addedAt.get(b.id) ?? 0) - (addedAt.get(a.id) ?? 0));
  },
);

/** Ids of the collections the favorite is in. */
export const selectFavoriteCollectionIds = createSelector(
  [selectMemberships, (_: RootState, favoriteId: string) => favoriteId],
  (memberships, favoriteId): readonly string[] =>
    memberships.filter((item) => item.favoriteId === favoriteId).map((item) => item.collectionId),
);
