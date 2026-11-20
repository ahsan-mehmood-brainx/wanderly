import { router, useNavigation, usePreventRemove } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { getErrorMessageKey } from '@/core/errors/errorMessages';
import { useAppTheme } from '@/core/theme/ThemeProvider';
import { type LocalDate } from '@/features/trips/domain/localDate';
import { currencyFractionDigits, parseAmount } from '@/features/trips/domain/money';
import { type StoredTrip } from '@/features/trips/domain/Trip';
import { ConfirmSheet } from '@/features/trips/presentation/components/ConfirmSheet';
import { CurrencySheet } from '@/features/trips/presentation/components/CurrencySheet';
import { PickerField } from '@/features/trips/presentation/components/PickerField';
import { useConnectivity } from '@/shared/hooks/useConnectivity';
import { routes } from '@/shared/navigation/routes';
import { AppButton, AppEmptyView, AppInput, AppText, InlineMessage } from '@/shared/ui';

import { convertMinor, parseDecimalRate } from '../../domain/budgetCalculations';
import { type Expense, EXPENSE_LIMITS } from '../../domain/Expense';
import { EXPENSE_CURRENCIES, type ExpenseField } from '../../domain/expenseValidation';
import { BudgetStateView } from '../components/BudgetStateView';
import { ExchangeRateNote } from '../components/ExchangeRateNote';
import { ExpenseCategoryPicker } from '../components/ExpenseCategoryPicker';
import { ExpenseDateSheet } from '../components/ExpenseDateSheet';
import { PaymentMethodPicker } from '../components/PaymentMethodPicker';
import { expenseFieldError, formatExpenseDate, formatMoney } from '../format';
import { useExpense } from '../hooks/useExpense';
import { type RatePreview, useExpenseForm } from '../hooks/useExpenseForm';
import { useTripBudget } from '../hooks/useTripBudget';

interface NewExpenseScreenProps {
  readonly tripId: string;
}

interface EditExpenseScreenProps {
  readonly tripId: string;
  readonly expenseId: string;
}

export function NewExpenseScreen({ tripId }: NewExpenseScreenProps) {
  const { screen, trip, today, retry } = useTripBudget(tripId, { convert: false });
  // The form copies its starting values once, so it starts only when the trip is known.
  if (screen.kind !== 'ready' || !trip) {
    return <BudgetStateView state={screen.kind === 'ready' ? { kind: 'loading' } : screen} onRetry={retry} />;
  }
  return <ExpenseForm key={tripId} trip={trip} expense={null} today={today} />;
}

export function EditExpenseScreen({ tripId, expenseId }: EditExpenseScreenProps) {
  const { t } = useTranslation();
  const { screen, trip, today, expense, retry } = useExpense(tripId, expenseId);
  if (screen.kind !== 'ready' || !trip) {
    return <BudgetStateView state={screen.kind === 'ready' ? { kind: 'loading' } : screen} onRetry={retry} />;
  }
  if (!expense) {
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
  return <ExpenseForm key={expense.id} trip={trip} expense={expense} today={today} />;
}

type OpenSheet = 'date' | 'currency' | null;
/** The navigation that was held back while the form has unsaved edits. */
type LeaveAction = Parameters<NonNullable<Parameters<typeof usePreventRemove>[1]>>[0]['data']['action'];

interface ExpenseFormProps {
  readonly trip: StoredTrip;
  readonly expense: Expense | null;
  readonly today: LocalDate;
}

function ExpenseForm({ trip, expense, today }: ExpenseFormProps) {
  const { t, i18n } = useTranslation();
  const { colors, spacing, sizes } = useAppTheme();
  const navigation = useNavigation();
  const { isOffline } = useConnectivity();
  const form = useExpenseForm(trip, expense, today);
  const { input, errors, savedExpense, preview } = form;
  const language = i18n.language;
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const [pendingLeave, setPendingLeave] = useState<LeaveAction | null>(null);
  const [confirmedLeave, setConfirmedLeave] = useState<LeaveAction | null>(null);

  // Leaving with unsaved edits asks first.
  usePreventRemove(form.dirty && confirmedLeave === null, ({ data }) => setPendingLeave(data.action));

  useEffect(() => {
    if (!confirmedLeave) return;
    // The guard must be off before the held-back navigation runs again.
    const timer = setTimeout(() => navigation.dispatch(confirmedLeave), 0);
    return () => clearTimeout(timer);
  }, [confirmedLeave, navigation]);

  useEffect(() => {
    if (!savedExpense) return;
    // One macrotask later, so the leave guard has switched off.
    const timer = setTimeout(() => {
      if (router.canGoBack()) router.back();
      else router.replace(routes.expense(savedExpense.tripId, savedExpense.id));
    }, 0);
    return () => clearTimeout(timer);
  }, [savedExpense]);

  const errorFor = (field: ExpenseField) => expenseFieldError(field, errors, input.currency, t);
  const noDecimals = currencyFractionDigits(input.currency) === 0;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.fill, { backgroundColor: colors.background }]}
    >
      <ScrollView
        testID="expense-form"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentInsetAdjustmentBehavior="automatic"
        style={styles.fill}
        contentContainerStyle={[
          styles.content,
          { maxWidth: sizes.maxContentWidth, padding: spacing.lg, gap: spacing.lg },
        ]}
      >
        <AppInput
          label={t('budget.form.title')}
          placeholder={t('budget.form.titlePlaceholder')}
          value={input.title}
          onChangeText={form.setTitle}
          error={errorFor('title')}
          maxLength={EXPENSE_LIMITS.titleMaxLength}
          returnKeyType="next"
        />
        <View style={[styles.row, { gap: spacing.md }]}>
          <AppInput
            label={t('budget.form.amount')}
            placeholder={noDecimals ? '0' : t('trips.form.budgetPlaceholder')}
            value={input.amount}
            onChangeText={form.setAmount}
            error={errorFor('amount')}
            keyboardType={noDecimals ? 'number-pad' : 'decimal-pad'}
            leftIcon="currency"
            containerStyle={styles.fill}
          />
          <View style={styles.currency}>
            <PickerField
              label={t('budget.form.currency')}
              value={input.currency}
              placeholder={input.currency}
              icon="wallet"
              error={errorFor('currency')}
              onPress={() => setSheet('currency')}
              testID="expense-currency-field"
            />
          </View>
        </View>
        <ConversionHint
          preview={preview}
          amount={input.amount}
          currency={input.currency}
          baseCurrency={trip.currency}
          isOffline={isOffline}
          language={language}
        />
        {preview.status === 'unavailable' ? (
          <AppInput
            label={t('budget.form.manualRate')}
            hint={t('budget.form.manualRateHint', { from: input.currency, to: trip.currency })}
            placeholder="1.00"
            value={input.manualRate}
            onChangeText={form.setManualRate}
            error={errorFor('manualRate')}
            keyboardType="decimal-pad"
          />
        ) : null}
        <ExpenseCategoryPicker value={input.category} onChange={form.setCategory} error={errorFor('category')} />
        <PickerField
          label={t('budget.form.date')}
          value={input.date ? formatExpenseDate(input.date, language) : null}
          placeholder={t('budget.form.datePlaceholder')}
          icon="calendar"
          error={errorFor('date')}
          onPress={() => setSheet('date')}
          testID="expense-date-field"
        />
        <PaymentMethodPicker
          value={input.paymentMethod}
          onChange={form.setPaymentMethod}
          error={errorFor('paymentMethod')}
        />
        <AppInput
          label={t('budget.form.notes')}
          placeholder={t('budget.form.notesPlaceholder')}
          hint={t('budget.form.optional')}
          value={input.notes}
          onChangeText={form.setNotes}
          error={errorFor('notes')}
          maxLength={EXPENSE_LIMITS.notesMaxLength}
          multiline
        />

        {form.failure ? <InlineMessage message={t(getErrorMessageKey(form.failure))} /> : null}

        <AppButton
          label={expense ? t('budget.form.save') : t('budget.form.create')}
          fullWidth
          size="lg"
          loading={form.saving}
          onPress={() => void form.submit()}
        />
      </ScrollView>

      <ExpenseDateSheet
        visible={sheet === 'date'}
        startDate={trip.startDate}
        endDate={trip.endDate}
        today={today}
        value={input.date}
        onClose={() => setSheet(null)}
        onSelect={(date) => {
          form.setDate(date);
          setSheet(null);
        }}
      />
      <CurrencySheet
        visible={sheet === 'currency'}
        value={input.currency}
        currencies={EXPENSE_CURRENCIES}
        onClose={() => setSheet(null)}
        onSelect={(currency) => {
          form.setCurrency(currency);
          setSheet(null);
        }}
      />
      <ConfirmSheet
        visible={pendingLeave !== null}
        title={t('budget.form.discardTitle')}
        message={t('budget.form.discardMessage')}
        confirmLabel={t('budget.form.discard')}
        cancelLabel={t('budget.form.keepEditing')}
        onCancel={() => setPendingLeave(null)}
        onConfirm={() => {
          setConfirmedLeave(pendingLeave);
          setPendingLeave(null);
        }}
        testID="discard-expense-sheet"
      />
    </KeyboardAvoidingView>
  );
}

interface ConversionHintProps {
  readonly preview: RatePreview;
  readonly amount: string;
  readonly currency: string;
  readonly baseCurrency: string;
  readonly isOffline: boolean;
  readonly language: string;
}

/** For an amount in another currency: the rate (with its date) and roughly what it comes to in the trip's currency. */
function ConversionHint({ preview, amount, currency, baseCurrency, isOffline, language }: ConversionHintProps) {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  switch (preview.status) {
    case 'none':
      return null;
    case 'loading':
      return (
        <AppText variant="caption" color="textSecondary">
          {isOffline ? t('budget.rate.offline') : t('budget.rate.checking')}
        </AppText>
      );
    case 'unavailable':
      return (
        <InlineMessage
          tone="info"
          icon={isOffline ? 'offline' : 'info'}
          message={isOffline ? t('budget.rate.offline') : t('budget.rate.unavailable')}
        />
      );
    case 'ready': {
      const parsed = parseAmount(amount, currency, EXPENSE_LIMITS.maxAmountMajor);
      const rate = parseDecimalRate(preview.rate.rate);
      const converted =
        parsed.ok && rate !== null
          ? formatMoney(convertMinor(parsed.minor, currency, baseCurrency, rate), baseCurrency, language)
          : null;
      return (
        <View style={{ gap: spacing.xxs }}>
          {converted ? <AppText variant="callout">{t('budget.form.converted', { amount: converted })}</AppText> : null}
          <ExchangeRateNote rate={preview.rate} from={currency} to={baseCurrency} />
        </View>
      );
    }
  }
}

const CURRENCY_FIELD_WIDTH = 132;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flexGrow: 1, width: '100%', alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  currency: { width: CURRENCY_FIELD_WIDTH },
});
