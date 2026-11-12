import { useLocalSearchParams } from 'expo-router';

import { TripWeatherScreen } from '@/features/trips/presentation/screens/TripWeatherScreen';
import { InvalidLinkView } from '@/shared/navigation/InvalidLinkView';
import { parseRouteId, type TripRouteParams } from '@/shared/navigation/routes';

export default function TripWeatherRoute() {
  const tripId = parseRouteId(useLocalSearchParams<TripRouteParams>().tripId);
  return tripId ? <TripWeatherScreen /> : <InvalidLinkView />;
}
