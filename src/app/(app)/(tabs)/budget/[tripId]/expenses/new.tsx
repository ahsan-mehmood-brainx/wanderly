import { useLocalSearchParams } from 'expo-router';

import { NewExpenseScreen } from '@/features/budget/presentation/screens/ExpenseFormScreen';
import { InvalidLinkView } from '@/shared/navigation/InvalidLinkView';
import { parseRouteId, type TripRouteParams } from '@/shared/navigation/routes';

export default function NewExpenseRoute() {
  const params = useLocalSearchParams<TripRouteParams>();
  const tripId = parseRouteId(params.tripId);
  return tripId ? <NewExpenseScreen tripId={tripId} /> : <InvalidLinkView />;
}
