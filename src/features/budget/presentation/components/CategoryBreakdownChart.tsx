import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppIcon, AppText } from '@/shared/ui';

import { type CategoryTotal } from '../../domain/budgetCalculations';
import { EXPENSE_CATEGORY_ICONS, formatMoney, formatShare } from '../format';

interface CategoryBreakdownChartProps {
  readonly totals: readonly CategoryTotal[];
  readonly currency: string;
}

const BAR_HEIGHT = 8;

/**
 * One horizontal bar per category with spending, largest first, scaled to the
 * largest. Each row reads as one sentence for screen readers.
 */
export function CategoryBreakdownChart({ totals, currency }: CategoryBreakdownChartProps) {
  const { t, i18n } = useTranslation();
  const { colors, spacing, radii } = useAppTheme();
  const language = i18n.language;
  const shown = totals.filter(({ amount }) => amount > 0);
  const largest = shown[0]?.amount ?? 0;

  return (
    <View style={{ gap: spacing.md }}>
      {shown.map(({ category, amount, share }) => {
        const name = t(`budget.categories.${category}`);
        const money = formatMoney(amount, currency, language);
        const percent = formatShare(share, language);
        const width = largest > 0 ? Math.max(1, Math.round((amount / largest) * 100)) : 0;
        return (
          <View
            key={category}
            testID={`category-bar-${category}`}
            accessible
            accessibilityLabel={t('budget.categoryBarLabel', { category: name, amount: money, percent })}
            style={{ gap: spacing.xs }}
          >
            <View style={[styles.row, { gap: spacing.sm }]}>
              <AppIcon name={EXPENSE_CATEGORY_ICONS[category]} size="sm" color="primary" />
              <AppText variant="label" style={styles.fill}>
                {name}
              </AppText>
              <AppText variant="label">{money}</AppText>
              <AppText variant="caption" color="textSecondary" style={styles.share}>
                {percent}
              </AppText>
            </View>
            <View style={[styles.track, { borderRadius: radii.pill, backgroundColor: colors.surfaceMuted }]}>
              <View
                style={[styles.bar, { width: `${width}%`, borderRadius: radii.pill, backgroundColor: colors.primary }]}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const SHARE_WIDTH = 44;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  fill: { flex: 1 },
  share: { width: SHARE_WIDTH, textAlign: 'right' },
  track: { height: BAR_HEIGHT, overflow: 'hidden' },
  bar: { height: BAR_HEIGHT },
});
