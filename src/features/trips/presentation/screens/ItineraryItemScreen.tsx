import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { routes } from '@/shared/navigation/routes';
import { AppEmptyView } from '@/shared/ui';

interface ItineraryItemScreenProps {
  /** Both already validated by the route. */
  readonly tripId: string;
  readonly itemId: string;
}

/** Deep-link target for `/trips/:tripId/itinerary/:itemId`. */
export function ItineraryItemScreen({ tripId, itemId }: ItineraryItemScreenProps) {
  const { t } = useTranslation();
  return (
    <AppEmptyView
      fullScreen
      icon="calendar"
      title={t('trips.itineraryTitle')}
      message={t('trips.itineraryMessage', { tripId, itemId })}
      actionLabel={t('trips.viewTrip')}
      onAction={() => router.navigate(routes.trip(tripId))}
      testID="itinerary-item-screen"
    />
  );
}
