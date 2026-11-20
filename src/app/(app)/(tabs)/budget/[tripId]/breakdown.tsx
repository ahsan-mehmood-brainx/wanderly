import { useLocalSearchParams } from 'expo-router';

import { SpendingBreakdownScreen } from '@/features/budget/presentation/screens/SpendingBreakdownScreen';
import { InvalidLinkView } from '@/shared/navigation/InvalidLinkView';
import { parseRouteId, type TripRouteParams } from '@/shared/navigation/routes';

export default function BreakdownRoute() {
  const params = useLocalSearchParams<TripRouteParams>();
  const tripId = parseRouteId(params.tripId);
  return tripId ? <SpendingBreakdownScreen tripId={tripId} /> : <InvalidLinkView />;
}
