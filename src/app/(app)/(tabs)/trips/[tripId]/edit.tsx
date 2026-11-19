import { useLocalSearchParams } from 'expo-router';

import { EditTripScreen } from '@/features/trips/presentation/screens/TripFormScreen';
import { InvalidLinkView } from '@/shared/navigation/InvalidLinkView';
import { parseRouteId, type TripRouteParams } from '@/shared/navigation/routes';

export default function EditTripRoute() {
  const tripId = parseRouteId(useLocalSearchParams<TripRouteParams>().tripId);
  return tripId ? <EditTripScreen tripId={tripId} /> : <InvalidLinkView />;
}
