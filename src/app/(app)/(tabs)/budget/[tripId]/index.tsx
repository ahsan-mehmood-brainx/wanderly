import { useLocalSearchParams } from 'expo-router';

import { BudgetOverviewScreen } from '@/features/budget/presentation/screens/BudgetOverviewScreen';
import { InvalidLinkView } from '@/shared/navigation/InvalidLinkView';
import { parseRouteId, type TripRouteParams } from '@/shared/navigation/routes';

export default function TripBudgetRoute() {
  const params = useLocalSearchParams<TripRouteParams>();
  const tripId = parseRouteId(params.tripId);
  return tripId ? <BudgetOverviewScreen tripId={tripId} /> : <InvalidLinkView />;
}
