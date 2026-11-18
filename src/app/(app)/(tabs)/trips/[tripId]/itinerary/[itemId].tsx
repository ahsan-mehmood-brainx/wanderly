import { useLocalSearchParams } from 'expo-router';

import { ItineraryItemScreen } from '@/features/trips/presentation/screens/ItineraryItemScreen';
import { InvalidLinkView } from '@/shared/navigation/InvalidLinkView';
import { parseRouteId, type ItineraryItemRouteParams } from '@/shared/navigation/routes';

export default function ItineraryItemRoute() {
  const params = useLocalSearchParams<ItineraryItemRouteParams>();
  const tripId = parseRouteId(params.tripId);
  const itemId = parseRouteId(params.itemId);
  return tripId && itemId ? <ItineraryItemScreen tripId={tripId} itemId={itemId} /> : <InvalidLinkView />;
}
