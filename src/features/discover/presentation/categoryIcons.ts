import { type AppIconName } from '@/shared/ui';

import { type DestinationCategory } from '../domain/Destination';

export const CATEGORY_ICONS: Record<DestinationCategory, AppIconName> = {
  city: 'city',
  beach: 'beach',
  mountains: 'mountain',
  nature: 'nature',
  culture: 'culture',
  island: 'island',
};
