import { useLocalSearchParams } from 'expo-router';

import { EditActivityScreen } from '@/features/itinerary/presentation/screens/ActivityFormScreen';
import { InvalidLinkView } from '@/shared/navigation/InvalidLinkView';
import { type ItineraryItemRouteParams, parseRouteId } from '@/shared/navigation/routes';

export default function EditActivityRoute() {
  const params = useLocalSearchParams<ItineraryItemRouteParams>();
  const tripId = parseRouteId(params.tripId);
  const itemId = parseRouteId(params.itemId);
  return tripId && itemId ? <EditActivityScreen tripId={tripId} activityId={itemId} /> : <InvalidLinkView />;
}
