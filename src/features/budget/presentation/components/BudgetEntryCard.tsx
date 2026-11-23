import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { routes } from '@/shared/navigation/routes';
import { AppCard, AppIcon, AppText } from '@/shared/ui';

import { formatMoney } from '../format';
import { useTripBudget } from '../hooks/useTripBudget';
import { SpendingProgressBar } from './SpendingProgressBar';

/** The way into a trip's budget from its details, with what was spent so far. */
export function BudgetEntryCard({ tripId }: { readonly tripId: string }) {
  const { t, i18n } = useTranslation();
  const { spacing } = useAppTheme();
  const { summary } = useTripBudget(tripId);
  const language = i18n.language;
  const text = summary
    ? t('budget.entrySummary', {
        spent: formatMoney(summary.totalSpent, summary.currency, language),
        budget: formatMoney(summary.totalBudget, summary.currency, language),
      })
    : '';

  return (
    <AppCard
      variant="outlined"
      onPress={() => router.push(routes.tripBudget(tripId))}
      accessibilityLabel={t('budget.entryLabel', { summary: text })}
      accessibilityHint={t('budget.entryHint')}
      testID="trip-budget-entry"
    >
      <View style={{ gap: spacing.sm }}>
        <View style={[styles.header, { gap: spacing.sm }]}>
          <AppIcon name="wallet" size="md" color="primary" />
          <AppText variant="headline" style={styles.fill}>
            {t('budget.entryTitle')}
          </AppText>
          <AppIcon name="chevronRight" size="sm" color="textSecondary" />
        </View>
        {summary ? (
          <>
            <AppText variant="callout" color="textSecondary">
              {text}
            </AppText>
            <SpendingProgressBar percentSpent={summary.percentSpent} />
          </>
        ) : null}
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center' },
  fill: { flex: 1 },
});
