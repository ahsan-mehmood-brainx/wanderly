import { router } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useAppSelector } from '@/core/store/hooks';
import { tripsSelectors } from '@/features/trips/presentation/state/tripsSlice';
import { routes } from '@/shared/navigation/routes';
import { AppEmptyView, AppErrorView, AppLoader } from '@/shared/ui';

import { useBudgetTrip } from '../hooks/useBudgetTrip';
import { BudgetOverviewScreen } from './BudgetOverviewScreen';

/** The Budget tab: the budget of the trip that matters now, with a switcher to the others. */
export function BudgetScreen() {
  const { t } = useTranslation();
  const { tripId, pick, loading, failed, errorKind, retry } = useBudgetTrip();
  const allTrips = useAppSelector((state) => tripsSelectors.selectAll(state.trips));
  const switcher = useMemo(() => ({ trips: allTrips, onSelect: pick }), [allTrips, pick]);

  if (tripId !== null) return <BudgetOverviewScreen key={tripId} tripId={tripId} switcher={switcher} />;
  if (loading) return <AppLoader fullScreen />;
  if (failed) return <AppErrorView fullScreen errorKind={errorKind ?? undefined} onRetry={retry} />;
  return (
    <AppEmptyView
      fullScreen
      icon="wallet"
      title={t('budget.noTripsTitle')}
      message={t('budget.noTripsMessage')}
      actionLabel={t('budget.planTrip')}
      onAction={() => router.push(routes.newTrip)}
      testID="budget-no-trips"
    />
  );
}
