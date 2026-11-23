import { useLocalSearchParams } from 'expo-router';

import { EditExpenseScreen } from '@/features/budget/presentation/screens/ExpenseFormScreen';
import { InvalidLinkView } from '@/shared/navigation/InvalidLinkView';
import { type ExpenseRouteParams, parseRouteId } from '@/shared/navigation/routes';

export default function EditExpenseRoute() {
  const params = useLocalSearchParams<ExpenseRouteParams>();
  const tripId = parseRouteId(params.tripId);
  const expenseId = parseRouteId(params.expenseId);
  return tripId && expenseId ? <EditExpenseScreen tripId={tripId} expenseId={expenseId} /> : <InvalidLinkView />;
}
