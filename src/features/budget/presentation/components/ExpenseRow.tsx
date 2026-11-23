import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppIcon, AppText } from '@/shared/ui';

import { isCountedIn } from '../../domain/budgetCalculations';
import { type Expense } from '../../domain/Expense';
import { EXPENSE_CATEGORY_ICONS, formatExpenseDate, formatMoney } from '../format';

interface ExpenseRowProps {
  readonly expense: Expense;
  /** The trip's currency; the converted amount is shown when the expense was paid in another. */
  readonly tripCurrency: string;
  readonly onPress: () => void;
}

/** One expense in the history: what, when, how much, and in the trip's currency. */
export function ExpenseRow({ expense, tripCurrency, onPress }: ExpenseRowProps) {
  const { t, i18n } = useTranslation();
  const { colors, spacing, radii, opacity } = useAppTheme();
  const language = i18n.language;
  const category = t(`budget.categories.${expense.category}`);
  const date = formatExpenseDate(expense.date, language);
  const original = formatMoney(expense.amount, expense.currency, language);
  const converted = isCountedIn(expense, tripCurrency) ? formatMoney(expense.baseAmount, tripCurrency, language) : null;
  const foreign = expense.currency !== tripCurrency;

  return (
    <Pressable
      testID={`expense-row-${expense.id}`}
      accessibilityRole="button"
      accessibilityLabel={t('budget.rowLabel', {
        title: expense.title,
        amount: foreign ? `${original} (${converted ?? t('budget.notConverted')})` : original,
        category,
        date,
      })}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          gap: spacing.md,
          padding: spacing.md,
          borderRadius: radii.md,
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
        pressed ? { opacity: opacity.pressed } : null,
      ]}
    >
      <AppIcon name={EXPENSE_CATEGORY_ICONS[expense.category]} size="md" color="primary" />
      <View style={[styles.fill, { gap: spacing.xxs }]}>
        <AppText variant="headline" numberOfLines={2}>
          {expense.title}
        </AppText>
        <AppText variant="caption" color="textSecondary">
          {`${category} · ${date}`}
        </AppText>
      </View>
      <View style={[styles.amounts, { gap: spacing.xxs }]}>
        <AppText variant="headline">{original}</AppText>
        {foreign ? (
          converted ? (
            <AppText variant="caption" color="textSecondary">
              {converted}
            </AppText>
          ) : (
            <AppText variant="caption" color="warning">
              {t('budget.notConverted')}
            </AppText>
          )
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  fill: { flex: 1 },
  amounts: { alignItems: 'flex-end' },
});
