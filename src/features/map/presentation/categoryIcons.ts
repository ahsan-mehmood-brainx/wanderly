import { type AppIconName } from '@/shared/ui';

import { type PlaceCategory } from '../domain/Place';

export const PLACE_CATEGORY_ICONS: Record<PlaceCategory, AppIconName> = {
  attractions: 'attraction',
  restaurants: 'restaurant',
  hotels: 'hotel',
  museums: 'museum',
  parks: 'park',
  landmarks: 'landmark',
};
