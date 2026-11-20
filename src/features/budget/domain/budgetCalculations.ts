import { addDays, compareLocalDates, type LocalDate } from '@/features/trips/domain/localDate';
import { currencyFractionDigits } from '@/features/trips/domain/money';

import { EXPENSE_CATEGORIES, type Expense, type ExpenseCategory } from './Expense';

/** What a budget is measured against: the trip's budget, currency and days. */
export interface BudgetTarget {
  /** Minor units of `currency`. */
  readonly budget: number;
  readonly currency: string;
  readonly startDate: LocalDate;
  readonly endDate: LocalDate;
}

export interface CategoryTotal {
  readonly category: ExpenseCategory;
  /** Minor units of the base currency. */
  readonly amount: number;
  /** Whole percent of the total spent; the shares add up to 100 when anything was spent. */
  readonly share: number;
}

export interface DailyTotal {
  readonly date: LocalDate;
  /** Minor units of the base currency. */
  readonly amount: number;
  /** False for a day outside the trip's dates that has expenses. */
  readonly inTrip: boolean;
}

export interface BudgetSummary {
  readonly currency: string;
  readonly totalBudget: number;
  readonly totalSpent: number;
  /** Negative when over budget. */
  readonly remaining: number;
  /** Basis points (12000 = 120%), or `null` when the budget is 0. */
  readonly percentSpent: number | null;
  /** All categories, largest amount first. */
  readonly categoryTotals: readonly CategoryTotal[];
  /** Every trip day plus any other day with expenses, by date. */
  readonly dailyTotals: readonly DailyTotal[];
  /** Expenses left out of every total because they have no amount in `currency`. */
  readonly unconvertedCount: number;
}

const DECIMAL = /^(\d+)(?:\.(\d+))?$/;

/** Longest trip span walked when listing days, as a guard against corrupt dates. */
const MAX_TRIP_DAYS = 366;

/** A positive decimal rate as a normalised string, or `null` when `text` isn't one. */
export function parseDecimalRate(text: string): string | null {
  const match = DECIMAL.exec(text.trim().replace(',', '.'));
  if (!match) return null;
  const whole = (match[1] ?? '0').replace(/^0+(?=\d)/, '');
  const fraction = (match[2] ?? '').replace(/0+$/, '');
  if (/^0*$/.test(whole) && fraction === '') return null;
  return fraction ? `${whole}.${fraction}` : whole;
}

/** The rate as an integer numerator over a power-of-ten denominator. */
function rateParts(rate: string): { readonly numerator: bigint; readonly scale: bigint } {
  const normalised = DECIMAL.test(rate) ? parseDecimalRate(rate) : null;
  if (normalised === null) throw new RangeError(`Not a positive decimal rate: ${rate}`);
  const [whole = '0', fraction = ''] = normalised.split('.');
  return { numerator: BigInt(whole + fraction), scale: BigInt(10) ** BigInt(fraction.length) };
}

/** `numerator / denominator` rounded half up, for non-negative values. */
function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  const two = BigInt(2);
  return (numerator * two + denominator) / (denominator * two);
}

/**
 * Converts minor units of `from` into minor units of `to` at `1 from = rate to`,
 * exactly (BigInt), rounding half up. Throws a `RangeError` for a rate that isn't a positive decimal
 * or a result too large to hold exactly as a number.
 */
export function convertMinor(amountMinor: number, from: string, to: string, rate: string): number {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new RangeError(`Not a non-negative amount in minor units: ${amountMinor}`);
  }
  const { numerator, scale } = rateParts(rate);
  const ten = BigInt(10);
  const result = divideHalfUp(
    BigInt(amountMinor) * numerator * ten ** BigInt(currencyFractionDigits(to)),
    scale * ten ** BigInt(currencyFractionDigits(from)),
  );
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`Converted amount is not a safe integer: ${result.toString()}`);
  }
  return Number(result);
}

/** Spent as basis points of the budget, rounded half up; `null` when the budget is 0. */
export function percentSpentBasisPoints(spentMinor: number, budgetMinor: number): number | null {
  if (budgetMinor <= 0) return null;
  return Number(divideHalfUp(BigInt(Math.max(0, spentMinor)) * BigInt(10_000), BigInt(budgetMinor)));
}

/** True when the expense has an amount in `currency` that can be added to the totals. */
export function isCountedIn(expense: Expense, currency: string): expense is Expense & { baseAmount: number } {
  return expense.baseAmount !== null && expense.baseCurrency === currency;
}

/** Whole-percent shares of `total` that add up to exactly 100 (largest remainder, ties in order). */
function percentShares(amounts: readonly number[], total: number): number[] {
  if (total <= 0) return amounts.map(() => 0);
  const exact = amounts.map((amount, index) => {
    const scaled = amount * 100;
    return { index, floor: Math.floor(scaled / total), remainder: scaled % total };
  });
  let left = 100 - exact.reduce((sum, { floor }) => sum + floor, 0);
  const shares = exact.map(({ floor }) => floor);
  const byRemainder = [...exact].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index, remainder } of byRemainder) {
    if (left <= 0 || remainder === 0) break;
    shares[index] = (shares[index] ?? 0) + 1;
    left -= 1;
  }
  return shares;
}

function tripDays(startDate: LocalDate, endDate: LocalDate): LocalDate[] {
  const days: LocalDate[] = [];
  for (let day = startDate; compareLocalDates(day, endDate) <= 0 && days.length < MAX_TRIP_DAYS;) {
    days.push(day);
    day = addDays(day, 1);
  }
  return days;
}

export function summarizeBudget(target: BudgetTarget, expenses: readonly Expense[]): BudgetSummary {
  const counted = expenses.filter((item) => isCountedIn(item, target.currency));
  const totalSpent = counted.reduce((sum, item) => sum + item.baseAmount, 0);

  const byCategory = new Map<ExpenseCategory, number>(EXPENSE_CATEGORIES.map((category) => [category, 0]));
  const byDay = new Map<LocalDate, number>(tripDays(target.startDate, target.endDate).map((day) => [day, 0]));
  const inTrip = new Set(byDay.keys());
  for (const item of counted) {
    byCategory.set(item.category, (byCategory.get(item.category) ?? 0) + item.baseAmount);
    byDay.set(item.date, (byDay.get(item.date) ?? 0) + item.baseAmount);
  }

  const categoryAmounts = EXPENSE_CATEGORIES.map((category) => byCategory.get(category) ?? 0);
  const shares = percentShares(categoryAmounts, totalSpent);
  const categoryTotals = EXPENSE_CATEGORIES.map((category, index) => ({
    category,
    amount: categoryAmounts[index] ?? 0,
    share: shares[index] ?? 0,
    index,
  }))
    .sort((a, b) => b.amount - a.amount || a.index - b.index)
    .map(({ category, amount, share }) => ({ category, amount, share }));

  const dailyTotals = [...byDay.entries()]
    .sort(([a], [b]) => compareLocalDates(a, b))
    .map(([date, amount]) => ({ date, amount, inTrip: inTrip.has(date) }));

  return {
    currency: target.currency,
    totalBudget: target.budget,
    totalSpent,
    remaining: target.budget - totalSpent,
    percentSpent: percentSpentBasisPoints(totalSpent, target.budget),
    categoryTotals,
    dailyTotals,
    unconvertedCount: expenses.length - counted.length,
  };
}
