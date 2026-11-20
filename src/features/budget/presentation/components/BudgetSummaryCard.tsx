import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/core/theme/ThemeProvider';
import { AppCard, AppText } from '@/shared/ui';

import { type BudgetSummary } from '../../domain/budgetCalculations';
import { formatMoney, formatPercent } from '../format';
import { SpendingProgressBar } from './SpendingProgressBar';

interface BudgetSummaryCardProps {
  readonly summary: BudgetSummary;
}

/** Budget, spent and remaining, with the share spent and an over-budget warning. */
export function BudgetSummaryCard({ summary }: BudgetSummaryCardProps) {
  const { t, i18n } = useTranslation();
  const { spacing } = useAppTheme();
  const language = i18n.language;
  const money = (minor: number) => formatMoney(minor, summary.currency, language);
  const over = summary.remaining < 0;

  return (
    <AppCard variant="outlined">
      <View style={{ gap: spacing.md }}>
        <View style={[styles.row, { gap: spacing.md }]}>
          <Figure label={t('budget.totalBudget')} value={money(summary.totalBudget)} />
          <Figure label={t('budget.spent')} value={money(summary.totalSpent)} />
          <Figure label={t('budget.remaining')} value={money(summary.remaining)} danger={over} />
        </View>
        <SpendingProgressBar percentSpent={summary.percentSpent} />
        <AppText variant="callout" color="textSecondary">
          {summary.percentSpent === null
            ? t('budget.noBudget')
            : t('budget.percentSpent', { percent: formatPercent(summary.percentSpent, language) })}
        </AppText>
        {over ? (
          <AppText variant="headline" color="danger" accessibilityLiveRegion="polite">
            {t('budget.overBudget', { amount: money(-summary.remaining) })}
          </AppText>
        ) : null}
      </View>
    </AppCard>
  );
}

function Figure({
  label,
  value,
  danger,
}: {
  readonly label: string;
  readonly value: string;
  readonly danger?: boolean;
}) {
  const { spacing } = useAppTheme();
  return (
    <View style={[styles.figure, { gap: spacing.xxs }]}>
      <AppText variant="caption" color="textSecondary">
        {label}
      </AppText>
      <AppText variant="headline" color={danger ? 'danger' : 'text'}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  figure: { flexGrow: 1, flexBasis: 90 },
});
