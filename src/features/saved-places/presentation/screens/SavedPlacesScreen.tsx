import { useTranslation } from 'react-i18next';

import { AppEmptyView } from '@/shared/ui';

/** Saved places. Favourites arrive with their own feature; until then, an honest empty state. */
export function SavedPlacesScreen() {
  const { t } = useTranslation();
  return (
    <AppEmptyView
      fullScreen
      icon="bookmark"
      title={t('savedPlaces.emptyTitle')}
      message={t('savedPlaces.emptyMessage')}
    />
  );
}
