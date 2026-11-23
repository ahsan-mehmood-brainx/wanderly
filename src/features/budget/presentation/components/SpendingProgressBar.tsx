import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';

interface SpendingProgressBarProps {
  /** Basis points of the budget spent (12000 = 120%), or `null` when there is no budget. */
  readonly percentSpent: number | null;
}

const FULL = 100;
const BAR_HEIGHT = 10;

/**
 * Share of the budget spent. The bar stops at full when over budget (the text
 * beside it gives the true percentage); screen readers hear the same capped value.
 */
export function SpendingProgressBar({ percentSpent }: SpendingProgressBarProps) {
  const { t } = useTranslation();
  const { colors, radii } = useAppTheme();
  const percent = percentSpent === null ? 0 : Math.min(FULL, Math.round(percentSpent / 100));
  const over = percentSpent !== null && percentSpent > FULL * 100;

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('budget.progressLabel')}
      accessibilityValue={{ min: 0, max: FULL, now: percent }}
      style={[styles.track, { borderRadius: radii.pill, backgroundColor: colors.surfaceMuted }]}
    >
      <View
        style={[
          styles.fill,
          {
            width: `${percent}%`,
            borderRadius: radii.pill,
            backgroundColor: over ? colors.danger : colors.primary,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: BAR_HEIGHT, overflow: 'hidden' },
  fill: { height: BAR_HEIGHT },
});
