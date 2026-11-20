import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { type AppErrorKind } from '@/core/errors/AppError';
import { getErrorMessageKey } from '@/core/errors/errorMessages';
import { useAppDispatch } from '@/core/store/hooks';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { ConfirmSheet } from '@/features/trips/presentation/components/ConfirmSheet';
import { routes } from '@/shared/navigation/routes';
import {
  AppButton,
  AppCard,
  AppEmptyView,
  AppIcon,
  type AppIconName,
  AppText,
  InlineMessage,
  Screen,
} from '@/shared/ui';

import { isCountedIn } from '../../domain/budgetCalculations';
import { type Expense } from '../../domain/Expense';
import { BudgetStateView } from '../components/BudgetStateView';
import { ExchangeRateNote } from '../components/ExchangeRateNote';
import { EXPENSE_CATEGORY_ICONS, formatExpenseDate, formatMoney, PAYMENT_METHOD_ICONS } from '../format';
import { useExpense } from '../hooks/useExpense';
import { deleteExpense } from '../state/budgetSlice';

interface ExpenseDetailsScreenProps {
  /** Both validated by the route. */
  readonly tripId: string;
  readonly expenseId: string;
}

/** One expense, and the deep-link target for `/budget/:tripId/expenses/:expenseId`. */
export function ExpenseDetailsScreen({ tripId, expenseId }: ExpenseDetailsScreenProps) {
  const { t } = useTranslation();
  const { screen, trip, expense, retry } = useExpense(tripId, expenseId);
  // Set once deletion starts: the expense leaves the store before the screen has gone back.
  const [deleting, setDeleting] = useState(false);

  if (screen.kind !== 'ready' || !trip) {
    return <BudgetStateView state={screen.kind === 'ready' ? { kind: 'loading' } : screen} onRetry={retry} />;
  }
  if (expense) {
    return <ExpenseDetails expense={expense} tripCurrency={trip.currency} onDeletingChange={setDeleting} />;
  }
  if (deleting) return null;
  return (
    <AppEmptyView
      fullScreen
      icon="wallet"
      title={t('budget.notFoundTitle')}
      message={t('budget.notFoundMessage')}
      actionLabel={t('budget.backToHistory')}
      onAction={() => router.navigate(routes.expenseHistory(tripId))}
      testID="expense-not-found"
    />
  );
}

interface ExpenseDetailsProps {
  readonly expense: Expense;
  readonly tripCurrency: string;
  readonly onDeletingChange: (deleting: boolean) => void;
}

function ExpenseDetails({ expense, tripCurrency, onDeletingChange }: ExpenseDetailsProps) {
  const { t, i18n } = useTranslation();
  const { spacing } = useAppTheme();
  const dispatch = useAppDispatch();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [notice, setNotice] = useState<AppErrorKind | null>(null);
  const language = i18n.language;
  const foreign = expense.currency !== tripCurrency;
  const counted = isCountedIn(expense, tripCurrency);

  const confirmDelete = async () => {
    setConfirmingDelete(false);
    setNotice(null);
    onDeletingChange(true);
    const action = await dispatch(deleteExpense(expense.id));
    if (deleteExpense.fulfilled.match(action) && action.payload.status === 'deleted') {
      if (router.canGoBack()) router.back();
      else router.replace(routes.expenseHistory(expense.tripId));
      return;
    }
    onDeletingChange(false);
    if (deleteExpense.fulfilled.match(action) && action.payload.status === 'failed') {
      setNotice(action.payload.errorKind);
    } else if (deleteExpense.rejected.match(action) && !action.meta.condition) {
      setNotice('unknown');
    }
  };

  return (
    <Screen>
      <View testID="expense-details" style={{ gap: spacing.lg }}>
        <View style={[styles.row, { gap: spacing.sm }]}>
          <AppIcon name={EXPENSE_CATEGORY_ICONS[expense.category]} size="lg" color="primary" />
          <AppText variant="title" accessibilityRole="header" style={styles.fill}>
            {expense.title}
          </AppText>
        </View>

        {notice ? (
          <InlineMessage
            message={t(getErrorMessageKey(notice))}
            dismissLabel={t('common.dismiss')}
            onDismiss={() => setNotice(null)}
          />
        ) : null}

        <AppCard variant="outlined">
          <View style={{ gap: spacing.lg }}>
            <Fact
              icon="currency"
              label={t('budget.details.amount')}
              value={formatMoney(expense.amount, expense.currency, language)}
            />
            {foreign ? (
              <View style={{ gap: spacing.xs }}>
                <Fact
                  icon="wallet"
                  label={t('budget.details.converted')}
                  value={counted ? formatMoney(expense.baseAmount, tripCurrency, language) : t('budget.notConverted')}
                />
                {counted && expense.exchangeRate ? (
                  <ExchangeRateNote rate={expense.exchangeRate} from={expense.currency} to={tripCurrency} />
                ) : null}
              </View>
            ) : null}
            <Fact icon="calendar" label={t('budget.details.date')} value={formatExpenseDate(expense.date, language)} />
            <Fact
              icon={EXPENSE_CATEGORY_ICONS[expense.category]}
              label={t('budget.details.category')}
              value={t(`budget.categories.${expense.category}`)}
            />
            <Fact
              icon={PAYMENT_METHOD_ICONS[expense.paymentMethod]}
              label={t('budget.details.paymentMethod')}
              value={t(`budget.paymentMethods.${expense.paymentMethod}`)}
            />
            {expense.notes ? <Fact icon="info" label={t('budget.details.notes')} value={expense.notes} /> : null}
          </View>
        </AppCard>
      </View>

      <View style={{ gap: spacing.sm }}>
        <AppButton
          label={t('budget.details.edit')}
          leftIcon="edit"
          fullWidth
          onPress={() => router.push(routes.editExpense(expense.tripId, expense.id))}
        />
        <AppButton
          label={t('budget.details.delete')}
          variant="ghost"
          leftIcon="trash"
          fullWidth
          onPress={() => setConfirmingDelete(true)}
        />
      </View>

      <ConfirmSheet
        visible={confirmingDelete}
        title={t('budget.details.deleteTitle')}
        message={t('budget.details.deleteMessage', { title: expense.title })}
        confirmLabel={t('budget.details.deleteConfirm')}
        cancelLabel={t('budget.details.keep')}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setConfirmingDelete(false)}
        testID="delete-expense-sheet"
      />
    </Screen>
  );
}

function Fact({ icon, label, value }: { readonly icon: AppIconName; readonly label: string; readonly value: string }) {
  const { spacing } = useAppTheme();
  return (
    <View style={[styles.fact, { gap: spacing.md }]} accessible accessibilityLabel={`${label}: ${value}`}>
      <AppIcon name={icon} size="md" color="primary" />
      <View style={[styles.fill, { gap: spacing.xxs }]}>
        <AppText variant="caption" color="textSecondary">
          {label}
        </AppText>
        <AppText>{value}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  fact: { flexDirection: 'row', alignItems: 'flex-start' },
});
