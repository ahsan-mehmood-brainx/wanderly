import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { routes } from '@/shared/navigation/routes';
import { AppEmptyView, AppErrorView, AppLoader } from '@/shared/ui';

import { type BudgetScreenState } from '../hooks/useTripBudget';

interface BudgetStateViewProps {
  readonly state: Exclude<BudgetScreenState, { readonly kind: 'ready' }>;
  readonly onRetry: () => void;
}

/** What a budget screen shows while loading, after a failure, or when the trip is gone. */
export function BudgetStateView({ state, onRetry }: BudgetStateViewProps) {
  const { t } = useTranslation();
  switch (state.kind) {
    case 'loading':
      return <AppLoader fullScreen />;
    case 'failed':
      return <AppErrorView fullScreen errorKind={state.errorKind ?? undefined} onRetry={onRetry} />;
    case 'tripNotFound':
      return (
        <AppEmptyView
          fullScreen
          icon="luggage"
          title={t('trips.notFoundTitle')}
          message={t('trips.notFoundMessage')}
          actionLabel={t('trips.backToTrips')}
          onAction={() => router.navigate(routes.trips)}
          testID="budget-trip-not-found"
        />
      );
  }
}
