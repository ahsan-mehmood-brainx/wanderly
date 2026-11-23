import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppEmptyView, AppText, Screen } from '@/shared/ui';

import { BudgetStateView } from '../components/BudgetStateView';
import { CategoryBreakdownChart } from '../components/CategoryBreakdownChart';
import { DailySpendingChart } from '../components/DailySpendingChart';
import { UnconvertedBanner } from '../components/UnconvertedBanner';
import { useTripBudget } from '../hooks/useTripBudget';

interface SpendingBreakdownScreenProps {
  /** Validated by the route. */
  readonly tripId: string;
}

/** Spending by category and by day, drawn as bars. */
export function SpendingBreakdownScreen({ tripId }: SpendingBreakdownScreenProps) {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  const { screen, trip, summary, retry, convertAgain, converting } = useTripBudget(tripId);

  if (screen.kind !== 'ready' || !trip || !summary) {
    return <BudgetStateView state={screen.kind === 'ready' ? { kind: 'loading' } : screen} onRetry={retry} />;
  }

  return (
    <Screen>
      <View testID="spending-breakdown" style={{ gap: spacing.xl }}>
        <UnconvertedBanner count={summary.unconvertedCount} onRetry={convertAgain} retrying={converting} />
        {summary.totalSpent === 0 ? (
          <AppEmptyView icon="pieChart" title={t('budget.chartEmptyTitle')} message={t('budget.chartEmptyMessage')} />
        ) : (
          <>
            <View style={{ gap: spacing.md }}>
              <AppText variant="headline" accessibilityRole="header">
                {t('budget.byCategory')}
              </AppText>
              <CategoryBreakdownChart totals={summary.categoryTotals} currency={summary.currency} />
            </View>
            <View style={{ gap: spacing.md }}>
              <AppText variant="headline" accessibilityRole="header">
                {t('budget.byDay')}
              </AppText>
              <DailySpendingChart totals={summary.dailyTotals} currency={summary.currency} />
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}
