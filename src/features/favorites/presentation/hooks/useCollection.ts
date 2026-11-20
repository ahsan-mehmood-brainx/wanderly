import { useAppSelector } from '@/core/store/hooks';

import { selectCollectionById, selectCollectionFavorites } from '../state/selectors';
import { useFavoritesLoad } from './useFavorites';

/** One collection and its places, most recently added first. `collection` is undefined while loading or when it doesn't exist. */
export function useCollection(collectionId: string) {
  const load = useFavoritesLoad();
  const collection = useAppSelector((state) => selectCollectionById(state, collectionId));
  const favorites = useAppSelector((state) => selectCollectionFavorites(state, collectionId));
  return { ...load, collection, favorites };
}
