import { useLocalSearchParams } from 'expo-router';

import { TripScreen } from '@/features/trips/presentation/screens/TripScreen';
import { InvalidLinkView } from '@/shared/navigation/InvalidLinkView';
import { parseRouteId, type TripRouteParams } from '@/shared/navigation/routes';

export default function TripRoute() {
  const tripId = parseRouteId(useLocalSearchParams<TripRouteParams>().tripId);
  return tripId ? <TripScreen tripId={tripId} /> : <InvalidLinkView />;
}
