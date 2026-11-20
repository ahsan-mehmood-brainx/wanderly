import { normalizeQuery, normalizeText } from '@/features/discover/domain/searchMatching';

import { compareFavorites, type Favorite, type FavoriteCategory } from './Favorite';

export type FavoriteCategoryFilter = FavoriteCategory | 'all';

export interface FavoriteFilter {
  readonly query: string;
  readonly category: FavoriteCategoryFilter;
}

const matches = (favorite: Favorite, query: string) =>
  [favorite.name, favorite.subtitle, favorite.address].some(
    (field) => field !== null && normalizeText(field).includes(query),
  );

/**
 * The favorites in `category` whose name, subtitle or address contains `query`,
 * ignoring case and accents, newest first.
 */
export function filterFavorites(favorites: readonly Favorite[], filter: FavoriteFilter): Favorite[] {
  const query = normalizeText(normalizeQuery(filter.query));
  return favorites
    .filter((item) => filter.category === 'all' || item.category === filter.category)
    .filter((item) => query === '' || matches(item, query))
    .sort(compareFavorites);
}
