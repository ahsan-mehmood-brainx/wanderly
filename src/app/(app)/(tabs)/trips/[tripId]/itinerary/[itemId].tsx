import { useLocalSearchParams } from 'expo-router';

import { ActivityDetailsScreen } from '@/features/itinerary/presentation/screens/ActivityDetailsScreen';
import { InvalidLinkView } from '@/shared/navigation/InvalidLinkView';
import { type ItineraryItemRouteParams, parseRouteId } from '@/shared/navigation/routes';

export default function ItineraryItemRoute() {
  const params = useLocalSearchParams<ItineraryItemRouteParams>();
  const tripId = parseRouteId(params.tripId);
  const itemId = parseRouteId(params.itemId);
  return tripId && itemId ? <ActivityDetailsScreen tripId={tripId} activityId={itemId} /> : <InvalidLinkView />;
}
