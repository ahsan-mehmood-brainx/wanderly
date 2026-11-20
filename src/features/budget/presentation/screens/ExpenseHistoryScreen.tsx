import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { routes } from '@/shared/navigation/routes';
import { AppButton, AppChip, AppEmptyView, AppText } from '@/shared/ui';

import { EXPENSE_CATEGORIES, type ExpenseCategory } from '../../domain/Expense';
import { BudgetStateView } from '../components/BudgetStateView';
import { ExpenseRow } from '../components/ExpenseRow';
import { EXPENSE_CATEGORY_ICONS } from '../format';
import { useTripBudget } from '../hooks/useTripBudget';

interface ExpenseHistoryScreenProps {
  /** Validated by the route. */
  readonly tripId: string;
}

/** Every expense of the trip, newest first, with a category filter. */
export function ExpenseHistoryScreen({ tripId }: ExpenseHistoryScreenProps) {
  const { t } = useTranslation();
  const { colors, spacing, sizes } = useAppTheme();
  const { screen, trip, expenses, retry } = useTripBudget(tripId, { convert: false });
  const [filter, setFilter] = useState<ExpenseCategory | null>(null);

  const categories = useMemo(
    () => EXPENSE_CATEGORIES.filter((category) => expenses.some((item) => item.category === category)),
    [expenses],
  );
  const shown = useMemo(
    () => (filter === null ? expenses : expenses.filter((item) => item.category === filter)),
    [expenses, filter],
  );

  if (screen.kind !== 'ready' || !trip) {
    return <BudgetStateView state={screen.kind === 'ready' ? { kind: 'loading' } : screen} onRetry={retry} />;
  }
  if (expenses.length === 0) {
    return (
      <AppEmptyView
        fullScreen
        icon="wallet"
        title={t('budget.emptyTitle')}
        message={t('budget.emptyMessage')}
        actionLabel={t('budget.addExpense')}
        onAction={() => router.push(routes.newExpense(tripId))}
        testID="expense-history-empty"
      />
    );
  }

  return (
    <FlatList
      testID="expense-history"
      data={shown}
      keyExtractor={(item) => item.id}
      contentInsetAdjustmentBehavior="automatic"
      style={[styles.fill, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        { maxWidth: sizes.maxContentWidth, padding: spacing.lg, gap: spacing.sm },
      ]}
      ListHeaderComponent={
        <View style={{ gap: spacing.md, paddingBottom: spacing.sm }}>
          <View style={[styles.chips, { gap: spacing.sm }]}>
            <AppChip label={t('budget.allCategories')} selected={filter === null} onPress={() => setFilter(null)} />
            {categories.map((category) => (
              <AppChip
                key={category}
                label={t(`budget.categories.${category}`)}
                icon={EXPENSE_CATEGORY_ICONS[category]}
                selected={filter === category}
                onPress={() => setFilter(category)}
              />
            ))}
          </View>
          <AppButton
            label={t('budget.addExpense')}
            leftIcon="add"
            variant="outline"
            fullWidth
            onPress={() => router.push(routes.newExpense(tripId))}
          />
        </View>
      }
      ListEmptyComponent={<AppText color="textSecondary">{t('budget.noMatchingExpenses')}</AppText>}
      renderItem={({ item }) => (
        <ExpenseRow
          expense={item}
          tripCurrency={trip.currency}
          onPress={() => router.push(routes.expense(tripId, item.id))}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flexGrow: 1, width: '100%', alignSelf: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
});
