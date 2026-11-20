import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppDispatch, useAppSelector } from '@/core/store/hooks';

import { type FavoriteCategoryFilter, type FavoriteFilter } from '../../domain/favoriteSearch';
import { loadFavorites } from '../state/favoritesSlice';
import {
  selectAllFavorites,
  selectCollectionsWithCounts,
  selectFavoritesErrorKind,
  selectFavoritesLoadStatus,
  selectFilteredFavorites,
} from '../state/selectors';

/** Loads the account's favorites once per session; every screen showing them calls it. */
export function useFavoritesLoad() {
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectFavoritesLoadStatus);
  const errorKind = useAppSelector(selectFavoritesErrorKind);

  useEffect(() => {
    // Only the first caller loads: the thunk's condition skips it once loading has started.
    if (status === 'idle') void dispatch(loadFavorites());
  }, [dispatch, status]);

  const retry = useCallback(() => {
    void dispatch(loadFavorites());
  }, [dispatch]);

  return { status, errorKind, retry };
}

/** View model for Saved Places: every saved place, the search and category filter, and the collections. */
export function useFavorites() {
  const load = useFavoritesLoad();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<FavoriteCategoryFilter>('all');
  const filter: FavoriteFilter = useMemo(() => ({ query, category }), [query, category]);

  const all = useAppSelector(selectAllFavorites);
  const favorites = useAppSelector((state) => selectFilteredFavorites(state, filter));
  const collections = useAppSelector(selectCollectionsWithCounts);

  const clearFilter = useCallback(() => {
    setQuery('');
    setCategory('all');
  }, []);

  return {
    ...load,
    total: all.length,
    favorites,
    collections,
    query,
    setQuery,
    category,
    setCategory,
    clearFilter,
  };
}
