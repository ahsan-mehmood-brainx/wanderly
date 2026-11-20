import { isLocalDate } from '@/features/trips/domain/localDate';
import { type AmountParseError, parseAmount, TRIP_CURRENCIES } from '@/features/trips/domain/money';

import { parseDecimalRate } from './budgetCalculations';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_LIMITS,
  type ExpenseCategory,
  type ExpenseDraft,
  type ExpenseInput,
  PAYMENT_METHODS,
  type PaymentMethod,
} from './Expense';

export type ExpenseField =
  'title' | 'amount' | 'currency' | 'category' | 'date' | 'paymentMethod' | 'notes' | 'manualRate';

export type ExpenseFieldError = 'required' | 'tooLong' | 'invalid' | Exclude<AmountParseError, 'required'>;

export interface ExpenseValidationErrors {
  readonly fields: Partial<Record<ExpenseField, ExpenseFieldError>>;
}

export type ExpenseValidation =
  | { readonly ok: true; readonly draft: ExpenseDraft }
  | { readonly ok: false; readonly errors: ExpenseValidationErrors };

/**
 * Currencies an expense can be entered in: the trip form's list plus KWD, so a
 * three-decimal currency (Gulf travel) can be recorded as paid.
 */
export const EXPENSE_CURRENCIES: readonly string[] = [...TRIP_CURRENCIES, 'KWD'];

/** A minus sign in front of a number: reported as not positive rather than unreadable. */
const NEGATIVE_AMOUNT = /^\s*-\s*\d/;

const isCategory = (value: unknown): value is ExpenseCategory =>
  typeof value === 'string' && (EXPENSE_CATEGORIES as readonly string[]).includes(value);

const isPaymentMethod = (value: unknown): value is PaymentMethod =>
  typeof value === 'string' && (PAYMENT_METHODS as readonly string[]).includes(value);

/** Checks every rule of the expense form. */
export function validateExpenseInput(input: ExpenseInput): ExpenseValidation {
  const fields: Partial<Record<ExpenseField, ExpenseFieldError>> = {};

  const title = input.title.trim();
  if (!title) fields.title = 'required';
  else if (title.length > EXPENSE_LIMITS.titleMaxLength) fields.title = 'tooLong';

  const { currency } = input;
  if (!currency) fields.currency = 'required';
  else if (!EXPENSE_CURRENCIES.includes(currency)) fields.currency = 'invalid';

  const amount = parseAmount(input.amount, currency, EXPENSE_LIMITS.maxAmountMajor);
  if (NEGATIVE_AMOUNT.test(input.amount)) fields.amount = 'notPositive';
  else if (!amount.ok) fields.amount = amount.error;

  const { category, paymentMethod, date } = input;
  if (category === null) fields.category = 'required';
  else if (!isCategory(category)) fields.category = 'invalid';

  if (paymentMethod === null) fields.paymentMethod = 'required';
  else if (!isPaymentMethod(paymentMethod)) fields.paymentMethod = 'invalid';

  if (date === null) fields.date = 'required';
  else if (!isLocalDate(date)) fields.date = 'invalid';

  const notes = input.notes.trim();
  if (notes.length > EXPENSE_LIMITS.notesMaxLength) fields.notes = 'tooLong';

  let manualRate: string | null = null;
  if (input.manualRate.trim()) {
    manualRate = parseDecimalRate(input.manualRate);
    if (manualRate === null) fields.manualRate = 'invalid';
    else if (Number(manualRate) > EXPENSE_LIMITS.maxManualRate) fields.manualRate = 'tooLarge';
  }

  if (
    Object.keys(fields).length > 0 ||
    !amount.ok ||
    !isCategory(category) ||
    !isPaymentMethod(paymentMethod) ||
    date === null
  ) {
    return { ok: false, errors: { fields } };
  }

  return {
    ok: true,
    draft: { title, amount: amount.minor, currency, category, date, paymentMethod, notes, manualRate },
  };
}
