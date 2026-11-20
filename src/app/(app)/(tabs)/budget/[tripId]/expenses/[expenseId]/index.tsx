import { useLocalSearchParams } from 'expo-router';

import { ExpenseDetailsScreen } from '@/features/budget/presentation/screens/ExpenseDetailsScreen';
import { InvalidLinkView } from '@/shared/navigation/InvalidLinkView';
import { type ExpenseRouteParams, parseRouteId } from '@/shared/navigation/routes';

export default function ExpenseRoute() {
  const params = useLocalSearchParams<ExpenseRouteParams>();
  const tripId = parseRouteId(params.tripId);
  const expenseId = parseRouteId(params.expenseId);
  return tripId && expenseId ? <ExpenseDetailsScreen tripId={tripId} expenseId={expenseId} /> : <InvalidLinkView />;
}
