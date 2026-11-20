import { type LocalDate } from '@/features/trips/domain/localDate';

import { type ExchangeRateInfo } from './ExchangeRate';

export const EXPENSE_CATEGORIES = [
  'food',
  'transport',
  'accommodation',
  'shopping',
  'entertainment',
  'activities',
  'healthcare',
  'other',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const PAYMENT_METHODS = ['cash', 'card', 'mobileWallet', 'bankTransfer', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const DEFAULT_PAYMENT_METHOD: PaymentMethod = 'card';

/** One expense on a trip. Amounts are integers in the currency's minor units. */
export interface Expense {
  readonly id: string;
  readonly tripId: string;
  readonly title: string;
  /** Minor units of `currency`, always > 0. */
  readonly amount: number;
  /** ISO 4217 code the expense was paid in. */
  readonly currency: string;
  /** The trip currency `baseAmount` is in. */
  readonly baseCurrency: string;
  /** Minor units of `baseCurrency`, or `null` while the expense is not converted. */
  readonly baseAmount: number | null;
  /** Set exactly when `baseAmount` is. */
  readonly exchangeRate: ExchangeRateInfo | null;
  readonly category: ExpenseCategory;
  readonly date: LocalDate;
  readonly paymentMethod: PaymentMethod;
  /** Empty when there are none. */
  readonly notes: string;
  /** Epoch ms. */
  readonly createdAt: number;
  /** Epoch ms. */
  readonly updatedAt: number;
}

/** What the traveller entered in the expense form, before validation. */
export interface ExpenseInput {
  readonly title: string;
  /** As typed. */
  readonly amount: string;
  readonly currency: string;
  readonly category: ExpenseCategory | null;
  readonly date: LocalDate | null;
  readonly paymentMethod: PaymentMethod | null;
  readonly notes: string;
  /** `1 currency = x base currency`, typed only when no rate is available. Empty for none. */
  readonly manualRate: string;
}

/** A validated {@link ExpenseInput}: trimmed text and the amount in minor units. */
export interface ExpenseDraft {
  readonly title: string;
  readonly amount: number;
  readonly currency: string;
  readonly category: ExpenseCategory;
  readonly date: LocalDate;
  readonly paymentMethod: PaymentMethod;
  readonly notes: string;
  /** Normalised decimal string, or `null` when none was typed. */
  readonly manualRate: string | null;
}

export const EXPENSE_LIMITS = {
  titleMaxLength: 80,
  notesMaxLength: 2000,
  /** Upper bound for an amount in major units. */
  maxAmountMajor: 1_000_000,
  /**
   * Upper bound for a typed rate (`1 currency = x base currency`). Far above any real
   * rate between supported currencies, and with `maxAmountMajor` it keeps every
   * converted amount a safe integer, so a mistyped rate (extra zeros) is caught.
   */
  maxManualRate: 1_000_000,
} as const;
