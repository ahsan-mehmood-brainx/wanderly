import { useTranslation } from 'react-i18next';

import { AppEmptyView } from '@/shared/ui';

/** Trips list. Planning arrives with the trips & itineraries feature; until then, an honest empty state. */
export function TripsScreen() {
  const { t } = useTranslation();
  return <AppEmptyView fullScreen icon="luggage" title={t('trips.emptyTitle')} message={t('trips.emptyMessage')} />;
}
