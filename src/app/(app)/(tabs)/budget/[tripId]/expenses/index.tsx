import { useLocalSearchParams } from 'expo-router';

import { ExpenseHistoryScreen } from '@/features/budget/presentation/screens/ExpenseHistoryScreen';
import { InvalidLinkView } from '@/shared/navigation/InvalidLinkView';
import { parseRouteId, type TripRouteParams } from '@/shared/navigation/routes';

export default function ExpenseHistoryRoute() {
  const params = useLocalSearchParams<TripRouteParams>();
  const tripId = parseRouteId(params.tripId);
  return tripId ? <ExpenseHistoryScreen tripId={tripId} /> : <InvalidLinkView />;
}
