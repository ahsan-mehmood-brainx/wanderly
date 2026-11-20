import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { formatDayDate } from '@/features/itinerary/presentation/format';
import { AppText } from '@/shared/ui';

import { type DailyTotal } from '../../domain/budgetCalculations';
import { formatMoney } from '../format';

interface DailySpendingChartProps {
  readonly totals: readonly DailyTotal[];
  readonly currency: string;
}

const CHART_HEIGHT = 120;
const BAR_WIDTH = 28;
const MIN_BAR_HEIGHT = 2;

/**
 * A vertical bar per day, scaled to the busiest day and scrollable sideways for
 * long trips. Days outside the trip are drawn muted and say so to screen readers.
 */
export function DailySpendingChart({ totals, currency }: DailySpendingChartProps) {
  const { t, i18n } = useTranslation();
  const { colors, spacing, radii } = useAppTheme();
  const language = i18n.language;
  const largest = totals.reduce((max, { amount }) => Math.max(max, amount), 0);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={[styles.row, { gap: spacing.sm }]}>
        {totals.map(({ date, amount, inTrip }) => {
          const day = formatDayDate(date, language);
          const money = formatMoney(amount, currency, language);
          const label = t('budget.dayBarLabel', {
            date: inTrip ? day : `${day}, ${t('budget.outsideTrip')}`,
            amount: money,
          });
          const height = largest > 0 ? Math.max(MIN_BAR_HEIGHT, Math.round((amount / largest) * CHART_HEIGHT)) : 0;
          return (
            <View
              key={date}
              testID={`daily-bar-${date}`}
              accessible
              accessibilityLabel={label}
              style={[styles.column, { gap: spacing.xs }]}
            >
              <View style={[styles.track, { height: CHART_HEIGHT }]}>
                <View
                  style={{
                    height: amount > 0 ? height : 0,
                    width: BAR_WIDTH,
                    borderRadius: radii.xs,
                    backgroundColor: inTrip ? colors.primary : colors.border,
                  }}
                />
              </View>
              <AppText variant="caption" color={inTrip ? 'textSecondary' : 'textTertiary'} numberOfLines={2}>
                {day}
              </AppText>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const COLUMN_WIDTH = 56;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  column: { width: COLUMN_WIDTH, alignItems: 'center' },
  track: { justifyContent: 'flex-end' },
});
