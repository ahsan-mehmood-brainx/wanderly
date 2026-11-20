import { useLocalSearchParams } from 'expo-router';

import { DailyItineraryScreen } from '@/features/itinerary/presentation/screens/DailyItineraryScreen';
import { isLocalDate } from '@/features/trips/domain/localDate';
import { InvalidLinkView } from '@/shared/navigation/InvalidLinkView';
import { type ItineraryDayRouteParams, parseRouteId } from '@/shared/navigation/routes';

export default function ItineraryDayRoute() {
  const params = useLocalSearchParams<ItineraryDayRouteParams>();
  const tripId = parseRouteId(params.tripId);
  const date = isLocalDate(params.date) ? params.date : null;
  return tripId && date ? <DailyItineraryScreen tripId={tripId} date={date} /> : <InvalidLinkView />;
}
