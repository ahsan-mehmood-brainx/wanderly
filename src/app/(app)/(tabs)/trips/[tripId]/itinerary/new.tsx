import { useLocalSearchParams } from 'expo-router';

import { NewActivityScreen } from '@/features/itinerary/presentation/screens/ActivityFormScreen';
import { isLocalDate } from '@/features/trips/domain/localDate';
import { InvalidLinkView } from '@/shared/navigation/InvalidLinkView';
import { type NewActivityRouteParams, parseRouteId } from '@/shared/navigation/routes';

export default function NewActivityRoute() {
  const params = useLocalSearchParams<NewActivityRouteParams>();
  const tripId = parseRouteId(params.tripId);
  const date = isLocalDate(params.date) ? params.date : null;
  return tripId ? <NewActivityScreen tripId={tripId} date={date} /> : <InvalidLinkView />;
}
