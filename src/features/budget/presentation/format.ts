import { type TFunction } from 'i18next';

import { currencyFractionDigits } from '@/features/trips/domain/money';
import { formatBudget, formatTripDate } from '@/features/trips/presentation/format';
import { type AppIconName } from '@/shared/ui';

import { type ExchangeRateInfo } from '../domain/ExchangeRate';
import { EXPENSE_LIMITS, type ExpenseCategory, type PaymentMethod } from '../domain/Expense';
import { type ExpenseField, type ExpenseValidationErrors } from '../domain/expenseValidation';

export const EXPENSE_CATEGORY_ICONS: Readonly<Record<ExpenseCategory, AppIconName>> = {
  food: 'restaurant',
  transport: 'transport',
  accommodation: 'hotel',
  shopping: 'shopping',
  entertainment: 'entertainment',
  activities: 'attraction',
  healthcare: 'favorite',
  other: 'more',
};

export const PAYMENT_METHOD_ICONS: Readonly<Record<PaymentMethod, AppIconName>> = {
  cash: 'currency',
  card: 'wallet',
  mobileWallet: 'phone',
  bankTransfer: 'culture',
  other: 'more',
};

/** Minor units in the currency's own style (`$45.50`, `¥1,500`). */
export function formatMoney(minor: number, currency: string, language: string): string {
  return formatBudget(minor, currency, language);
}

/** Basis points as a whole percent (`12000` → `120%`). */
export function formatPercent(basisPoints: number, language: string): string {
  const percent = Math.round(basisPoints / 100);
  try {
    return new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 0 }).format(percent / 100);
  } catch {
    return `${percent}%`;
  }
}

/** A whole-number share (`68`) as `68%`. */
export function formatShare(share: number, language: string): string {
  return formatPercent(share * 100, language);
}

export function formatExpenseDate(date: string, language: string): string {
  return formatTripDate(date, language);
}

/** `Rate 1 EUR = 1.0805 USD · Jun 12, 2027`: always names the date the rate is for. */
export function formatRate(rate: ExchangeRateInfo, from: string, to: string, language: string, t: TFunction): string {
  return t('budget.rate.label', { from, to, rate: rate.rate, date: formatTripDate(rate.rateDate, language) });
}

/** The message for a form field's validation error. */
export function expenseFieldError(
  field: ExpenseField,
  errors: ExpenseValidationErrors | null,
  currency: string,
  t: TFunction,
): string | undefined {
  const code = errors?.fields[field];
  if (!code) return undefined;
  switch (field) {
    case 'title':
      return code === 'tooLong'
        ? t('budget.errors.titleTooLong', { max: EXPENSE_LIMITS.titleMaxLength })
        : t('budget.errors.titleRequired');
    case 'amount':
      switch (code) {
        case 'required':
          return t('budget.errors.amountRequired');
        case 'notPositive':
          return t('budget.errors.amountNotPositive');
        case 'tooLarge':
          return t('budget.errors.amountTooLarge');
        case 'tooManyDecimals':
          return currencyFractionDigits(currency) === 0
            ? t('budget.errors.amountNoDecimals', { currency })
            : t('budget.errors.amountDecimals', { count: currencyFractionDigits(currency) });
        default:
          return t('budget.errors.amountInvalid');
      }
    case 'currency':
      return t('budget.errors.currencyInvalid');
    case 'category':
      return t('budget.errors.categoryRequired');
    case 'paymentMethod':
      return t('budget.errors.paymentMethodRequired');
    case 'date':
      return code === 'required' ? t('budget.errors.dateRequired') : t('budget.errors.dateInvalid');
    case 'notes':
      return t('budget.errors.notesTooLong', { max: EXPENSE_LIMITS.notesMaxLength });
    case 'manualRate':
      return code === 'tooLarge' ? t('budget.errors.manualRateTooLarge') : t('budget.errors.manualRateInvalid');
  }
}
