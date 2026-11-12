import { useTranslation } from 'react-i18next';

import { AppEmptyView } from '@/shared/ui';

interface TripScreenProps {
  /** Already validated by the route. */
  readonly tripId: string;
}

/** Deep-link target for `/trips/:tripId`. */
export function TripScreen({ tripId }: TripScreenProps) {
  const { t } = useTranslation();
  return (
    <AppEmptyView
      fullScreen
      icon="luggage"
      title={t('trips.tripTitle')}
      message={t('trips.tripMessage', { id: tripId })}
      testID="trip-screen"
    />
  );
}
