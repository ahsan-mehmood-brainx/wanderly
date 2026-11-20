import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { type StoredTrip } from '@/features/trips/domain/Trip';
import { formatTripDates } from '@/features/trips/presentation/format';
import { routes } from '@/shared/navigation/routes';
import { AppButton, AppText, Screen } from '@/shared/ui';

import { type BudgetSummary } from '../../domain/budgetCalculations';
import { BudgetSheet } from '../components/BudgetSheet';
import { BudgetStateView } from '../components/BudgetStateView';
import { BudgetSummaryCard } from '../components/BudgetSummaryCard';
import { CategoryBreakdownChart } from '../components/CategoryBreakdownChart';
import { TripSwitcherSheet } from '../components/TripSwitcherSheet';
import { UnconvertedBanner } from '../components/UnconvertedBanner';
import { useTripBudget } from '../hooks/useTripBudget';

interface TripSwitcher {
  readonly trips: readonly StoredTrip[];
  readonly onSelect: (tripId: string) => void;
}

interface BudgetOverviewScreenProps {
  /** Validated by the route, or the trip the Budget tab picked. */
  readonly tripId: string;
  /** Offered on the Budget tab when there is more than one trip. */
  readonly switcher?: TripSwitcher;
}

/** A trip's budget at a glance, and the deep-link target for `/budget/:tripId`. */
export function BudgetOverviewScreen({ tripId, switcher }: BudgetOverviewScreenProps) {
  const { screen, trip, summary, retry, convertAgain, converting } = useTripBudget(tripId);
  if (screen.kind !== 'ready' || !trip || !summary) {
    return <BudgetStateView state={screen.kind === 'ready' ? { kind: 'loading' } : screen} onRetry={retry} />;
  }
  return (
    <BudgetOverview
      trip={trip}
      summary={summary}
      switcher={switcher}
      onConvertAgain={convertAgain}
      converting={converting}
    />
  );
}

interface BudgetOverviewProps {
  readonly trip: StoredTrip;
  readonly summary: BudgetSummary;
  readonly switcher?: TripSwitcher;
  readonly onConvertAgain: () => void;
  readonly converting: boolean;
}

type OpenSheet = 'budget' | 'trips' | null;

function BudgetOverview({ trip, summary, switcher, onConvertAgain, converting }: BudgetOverviewProps) {
  const { t, i18n } = useTranslation();
  const { spacing } = useAppTheme();
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const canSwitch = switcher !== undefined && switcher.trips.length > 1;

  return (
    <Screen>
      <View testID="budget-overview" style={{ gap: spacing.lg }}>
        <View style={[styles.header, { gap: spacing.sm }]}>
          <View style={[styles.fill, { gap: spacing.xxs }]}>
            <AppText variant="title" accessibilityRole="header">
              {trip.title}
            </AppText>
            <AppText variant="callout" color="textSecondary">
              {formatTripDates(trip.startDate, trip.endDate, i18n.language)}
            </AppText>
          </View>
          {canSwitch ? (
            <AppButton
              label={t('budget.switchTrip')}
              variant="ghost"
              size="sm"
              rightIcon="chevronDown"
              onPress={() => setSheet('trips')}
            />
          ) : null}
        </View>

        <UnconvertedBanner count={summary.unconvertedCount} onRetry={onConvertAgain} retrying={converting} />
        <BudgetSummaryCard summary={summary} />

        <View style={{ gap: spacing.sm }}>
          <AppButton
            label={t('budget.addExpense')}
            leftIcon="add"
            fullWidth
            onPress={() => router.push(routes.newExpense(trip.id))}
          />
          <AppButton
            label={t('budget.editBudget')}
            variant="outline"
            leftIcon="edit"
            fullWidth
            onPress={() => setSheet('budget')}
          />
        </View>

        <View style={{ gap: spacing.md }}>
          <AppText variant="headline" accessibilityRole="header">
            {t('budget.byCategory')}
          </AppText>
          {summary.totalSpent > 0 ? (
            <CategoryBreakdownChart totals={summary.categoryTotals} currency={summary.currency} />
          ) : (
            <AppText color="textSecondary">{t('budget.emptyMessage')}</AppText>
          )}
        </View>

        <View style={{ gap: spacing.sm }}>
          <AppButton
            label={t('budget.history')}
            variant="outline"
            leftIcon="history"
            fullWidth
            onPress={() => router.push(routes.expenseHistory(trip.id))}
          />
          <AppButton
            label={t('budget.breakdown')}
            variant="outline"
            leftIcon="pieChart"
            fullWidth
            onPress={() => router.push(routes.spendingBreakdown(trip.id))}
          />
        </View>
      </View>

      <BudgetSheet
        key={`${trip.id}-${trip.updatedAt}`}
        visible={sheet === 'budget'}
        trip={trip}
        onClose={() => setSheet(null)}
      />
      {switcher ? (
        <TripSwitcherSheet
          visible={sheet === 'trips'}
          trips={switcher.trips}
          value={trip.id}
          onClose={() => setSheet(null)}
          onSelect={(id) => {
            switcher.onSelect(id);
            setSheet(null);
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start' },
  fill: { flex: 1 },
});
