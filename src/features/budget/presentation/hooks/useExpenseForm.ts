import { useCallback, useEffect, useState } from 'react';

import { useDependencies } from '@/core/di/DependenciesProvider';
import { type AppErrorKind } from '@/core/errors/AppError';
import { useAppDispatch, useAppSelector } from '@/core/store/hooks';
import { isLocalDate, type LocalDate } from '@/features/trips/domain/localDate';
import { formatAmountInput } from '@/features/trips/domain/money';
import { type StoredTrip } from '@/features/trips/domain/Trip';

import { type ExchangeRateInfo } from '../../domain/ExchangeRate';
import {
  DEFAULT_PAYMENT_METHOD,
  type Expense,
  type ExpenseCategory,
  type ExpenseInput,
  type PaymentMethod,
} from '../../domain/Expense';
import { type ExpenseField, type ExpenseValidationErrors } from '../../domain/expenseValidation';
import { createExpense, updateExpense } from '../state/budgetSlice';
import { selectBudgetSaving } from '../state/selectors';

const DEFAULT_CATEGORY: ExpenseCategory = 'other';

/** How long typing pauses before the rate for a new currency or date is looked up. */
const RATE_PREVIEW_DELAY_MS = 400;

export type RatePreview =
  | { readonly status: 'none' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly rate: ExchangeRateInfo }
  | { readonly status: 'unavailable'; readonly errorKind: AppErrorKind };

/** Today when it falls within the trip, otherwise the trip's first day. */
function defaultDate(trip: StoredTrip, today: LocalDate): LocalDate {
  return today >= trip.startDate && today <= trip.endDate ? today : trip.startDate;
}

function initialInput(trip: StoredTrip, expense: Expense | null, today: LocalDate): ExpenseInput {
  if (!expense) {
    return {
      title: '',
      amount: '',
      currency: trip.currency,
      category: DEFAULT_CATEGORY,
      date: defaultDate(trip, today),
      paymentMethod: DEFAULT_PAYMENT_METHOD,
      notes: '',
      manualRate: '',
    };
  }
  return {
    title: expense.title,
    // Shortest editable form: `45.5` rather than `45.50`.
    amount: formatAmountInput(expense.amount, expense.currency)
      .replace(/(\.\d*?)0+$/, '$1')
      .replace(/\.$/, ''),
    currency: expense.currency,
    category: expense.category,
    date: expense.date,
    paymentMethod: expense.paymentMethod,
    notes: expense.notes,
    manualRate: expense.exchangeRate?.source === 'manual' ? expense.exchangeRate.rate : '',
  };
}

/** The form fields whose errors a change clears: its own, and those judged against it. */
const FIELDS_OF: Record<keyof ExpenseInput, readonly ExpenseField[]> = {
  title: ['title'],
  amount: ['amount'],
  currency: ['currency', 'amount'],
  category: ['category'],
  date: ['date'],
  paymentMethod: ['paymentMethod'],
  notes: ['notes'],
  manualRate: ['manualRate'],
};

/**
 * View model for the add and edit forms. `expense` is the one being edited, `null`
 * when adding. For an amount in another currency it looks up the rate as the
 * traveller types, so the form can show the converted amount, or offer a manual
 * rate when none is available.
 */
export function useExpenseForm(trip: StoredTrip, expense: Expense | null, today: LocalDate) {
  const dispatch = useAppDispatch();
  const { previewExchangeRate } = useDependencies();
  const saving = useAppSelector(selectBudgetSaving);

  const [initial] = useState(() => initialInput(trip, expense, today));
  const [input, setInput] = useState<ExpenseInput>(initial);
  const [errors, setErrors] = useState<ExpenseValidationErrors | null>(null);
  const [failure, setFailure] = useState<AppErrorKind | null>(null);
  const [savedExpense, setSavedExpense] = useState<Expense | null>(null);
  const [fetched, setFetched] = useState<{ readonly key: string; readonly preview: RatePreview } | null>(null);

  const { currency, date } = input;
  const baseCurrency = trip.currency;
  const previewDate = date !== null && isLocalDate(date) && currency !== baseCurrency ? date : null;
  const previewKey = previewDate === null ? null : `${currency}|${previewDate}`;

  useEffect(() => {
    if (previewDate === null || previewKey === null) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void previewExchangeRate
        .execute({ from: currency, to: baseCurrency, date: previewDate, signal: controller.signal })
        .then((result) => {
          if (controller.signal.aborted) return;
          setFetched({
            key: previewKey,
            preview: result.ok
              ? { status: 'ready', rate: result.value }
              : { status: 'unavailable', errorKind: result.error.kind },
          });
        });
    }, RATE_PREVIEW_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [baseCurrency, currency, previewDate, previewKey, previewExchangeRate]);

  const preview: RatePreview =
    previewKey === null ? { status: 'none' } : fetched?.key === previewKey ? fetched.preview : { status: 'loading' };

  const change = useCallback(<K extends keyof ExpenseInput>(key: K, value: ExpenseInput[K]) => {
    setInput((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current) return current;
      const cleared = FIELDS_OF[key];
      if (!cleared.some((field) => current.fields[field])) return current;
      const fields = { ...current.fields };
      for (const field of cleared) delete fields[field];
      return { fields };
    });
  }, []);

  const submit = useCallback(async () => {
    setFailure(null);
    // A typed rate only counts while no published rate is available. While the
    // lookup is still pending, a stored manual rate is kept so saving early never
    // drops it (the converter still prefers a published rate).
    const keepManualRate =
      preview.status === 'unavailable' || (preview.status === 'loading' && input.manualRate === initial.manualRate);
    const submitted = keepManualRate ? input : { ...input, manualRate: '' };
    const action = expense
      ? await dispatch(updateExpense({ id: expense.id, input: submitted }))
      : await dispatch(createExpense({ tripId: trip.id, input: submitted }));
    if (createExpense.rejected.match(action) || updateExpense.rejected.match(action)) {
      if (!action.meta.condition) setFailure('unknown');
      return;
    }
    const outcome = action.payload;
    switch (outcome.status) {
      case 'saved':
        setErrors(null);
        setSavedExpense(outcome.expense);
        break;
      case 'invalid':
        setErrors(outcome.errors);
        break;
      case 'failed':
        setFailure(outcome.errorKind);
        break;
    }
  }, [dispatch, expense, initial.manualRate, input, preview.status, trip.id]);

  return {
    input,
    errors,
    failure,
    saving,
    savedExpense,
    preview,
    /** Unsaved edits exist (leaving asks first). */
    dirty: savedExpense === null && JSON.stringify(input) !== JSON.stringify(initial),
    setTitle: (value: string) => change('title', value),
    setAmount: (value: string) => change('amount', value),
    setCurrency: (value: string) => change('currency', value),
    setCategory: (value: ExpenseCategory) => change('category', value),
    setDate: (value: LocalDate) => change('date', value),
    setPaymentMethod: (value: PaymentMethod) => change('paymentMethod', value),
    setNotes: (value: string) => change('notes', value),
    setManualRate: (value: string) => change('manualRate', value),
    submit,
  };
}
