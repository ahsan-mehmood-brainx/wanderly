import { type TFunction } from 'i18next';

import { type AppIconName } from '@/shared/ui';

import { type Collection } from '../domain/Collection';
import { type Favorite, type FavoriteCategory } from '../domain/Favorite';

export const FAVORITE_CATEGORY_ICONS: Record<FavoriteCategory, AppIconName> = {
  destination: 'city',
  country: 'flag',
  attraction: 'attraction',
  restaurant: 'restaurant',
  landmark: 'landmark',
};

/** Default collections are named in the UI language; custom ones by the traveller. */
export function collectionName(collection: Collection, t: TFunction): string {
  return collection.defaultKey !== null
    ? t(`savedPlaces.defaultCollections.${collection.defaultKey}`)
    : (collection.name ?? '');
}

/** Destinations and countries have a details screen; map places don't. */
export const opensDestination = (favorite: Favorite) =>
  favorite.category === 'destination' || favorite.category === 'country';
