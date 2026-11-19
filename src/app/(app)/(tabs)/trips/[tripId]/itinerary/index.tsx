import { useLocalSearchParams } from 'expo-router';

import { ItineraryOverviewScreen } from '@/features/itinerary/presentation/screens/ItineraryOverviewScreen';
import { InvalidLinkView } from '@/shared/navigation/InvalidLinkView';
import { parseRouteId, type TripRouteParams } from '@/shared/navigation/routes';

export default function ItineraryRoute() {
  const tripId = parseRouteId(useLocalSearchParams<TripRouteParams>().tripId);
  return tripId ? <ItineraryOverviewScreen tripId={tripId} /> : <InvalidLinkView />;
}
