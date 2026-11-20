import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppChip, AppText } from '@/shared/ui';

import { EXPENSE_CATEGORIES, type ExpenseCategory } from '../../domain/Expense';
import { EXPENSE_CATEGORY_ICONS } from '../format';

interface ExpenseCategoryPickerProps {
  readonly value: ExpenseCategory | null;
  readonly onChange: (category: ExpenseCategory) => void;
  readonly error?: string;
}

/** The expense categories as selectable chips. */
export function ExpenseCategoryPicker({ value, onChange, error }: ExpenseCategoryPickerProps) {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();

  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="label" color="textSecondary" accessibilityRole="header">
        {t('budget.form.category')}
      </AppText>
      <View style={[styles.chips, { gap: spacing.sm }]}>
        {EXPENSE_CATEGORIES.map((category) => (
          <AppChip
            key={category}
            label={t(`budget.categories.${category}`)}
            icon={EXPENSE_CATEGORY_ICONS[category]}
            selected={category === value}
            onPress={() => onChange(category)}
          />
        ))}
      </View>
      {error ? (
        <AppText variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
});
