import { euroExpense, expense, unconvertedExpense } from '@/testing/budgetFixtures';

import {
  type BudgetTarget,
  convertMinor,
  parseDecimalRate,
  percentSpentBasisPoints,
  summarizeBudget,
} from './budgetCalculations';
import { EXPENSE_CATEGORIES } from './Expense';

const TARGET: BudgetTarget = { budget: 100_000, currency: 'USD', startDate: '2027-06-10', endDate: '2027-06-12' };

describe('convertMinor', () => {
  it.each([
    ['EUR to JPY (2 to 0 digits)', 1999, 'EUR', 'JPY', '161.23', 3223],
    ['JPY to USD (0 to 2 digits)', 1000, 'JPY', 'USD', '0.0061', 610],
    ['USD to KWD (2 to 3 digits)', 1000, 'USD', 'KWD', '0.307', 3070],
    ['KWD to USD (3 to 2 digits)', 1234, 'KWD', 'USD', '3.2573', 402],
    ['JPY to KRW (0 to 0 digits)', 1500, 'JPY', 'KRW', '9.1234', 13685],
    ['EUR to USD', 2000, 'EUR', 'USD', '1.0805', 2161],
  ])('converts %s', (_name, amount, from, to, rate, expected) => {
    expect(convertMinor(amount, from, to, rate)).toBe(expected);
  });

  it('is exact where floating point is not (100 × 1.005 = 100.5, rounds up)', () => {
    expect(100 * 1.005).toBeLessThan(100.5);
    expect(convertMinor(100, 'USD', 'EUR', '1.005')).toBe(101);
  });

  it('rounds half up and drops anything below half a minor unit', () => {
    expect(convertMinor(1, 'USD', 'EUR', '0.5')).toBe(1);
    expect(convertMinor(1, 'USD', 'EUR', '0.49')).toBe(0);
    expect(convertMinor(3, 'USD', 'EUR', '0.5')).toBe(2);
  });

  it('keeps the amount at rate 1 and zero at zero', () => {
    expect(convertMinor(4550, 'USD', 'USD', '1')).toBe(4550);
    expect(convertMinor(0, 'EUR', 'USD', '1.0805')).toBe(0);
  });

  it('stays exact for large amounts and long rates', () => {
    expect(convertMinor(100_000_000_000, 'USD', 'EUR', '0.92345')).toBe(92_345_000_000);
    expect(convertMinor(99_999_999_999, 'USD', 'JPY', '157.123456')).toBe(157_123_455_998);
  });

  it('refuses a result too large to hold exactly as a number', () => {
    expect(convertMinor(Number.MAX_SAFE_INTEGER, 'USD', 'EUR', '1')).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => convertMinor(Number.MAX_SAFE_INTEGER, 'USD', 'EUR', '2')).toThrow(RangeError);
    // A mistyped rate with extra zeros on a large amount.
    expect(() => convertMinor(100_000_000, 'USD', 'EUR', '100000000000')).toThrow(RangeError);
  });

  it.each(['abc', '0', '-1.2', '', '1.2.3'])('refuses the rate %p', (rate) => {
    expect(() => convertMinor(100, 'USD', 'EUR', rate)).toThrow(RangeError);
  });
});

describe('parseDecimalRate', () => {
  it.each([
    ['1.0805', '1.0805'],
    [' 1,0805 ', '1.0805'],
    ['007.50', '7.5'],
    ['1.0', '1'],
    ['0.0061', '0.0061'],
  ])('reads %p as %p', (text, expected) => {
    expect(parseDecimalRate(text)).toBe(expected);
  });

  it.each(['', '0', '0.000', '-1', 'abc', '1.2.3', '1e5'])('rejects %p', (text) => {
    expect(parseDecimalRate(text)).toBeNull();
  });
});

describe('percentSpentBasisPoints', () => {
  it.each([
    [0, 10_000, 0],
    [5_000, 10_000, 5_000],
    [12_000, 10_000, 12_000],
    [1, 3, 3_333],
    [2, 3, 6_667],
  ])('%d of %d is %d basis points', (spent, budget, expected) => {
    expect(percentSpentBasisPoints(spent, budget)).toBe(expected);
  });

  it('is null for a zero budget', () => {
    expect(percentSpentBasisPoints(0, 0)).toBeNull();
    expect(percentSpentBasisPoints(500, 0)).toBeNull();
  });
});

describe('summarizeBudget', () => {
  it('starts with the whole budget remaining and every day and category at zero', () => {
    const summary = summarizeBudget(TARGET, []);

    expect(summary).toMatchObject({
      currency: 'USD',
      totalBudget: 100_000,
      totalSpent: 0,
      remaining: 100_000,
      percentSpent: 0,
      unconvertedCount: 0,
    });
    expect(summary.categoryTotals.map(({ category }) => category)).toEqual([...EXPENSE_CATEGORIES]);
    expect(summary.categoryTotals.every(({ amount, share }) => amount === 0 && share === 0)).toBe(true);
    expect(summary.dailyTotals).toEqual([
      { date: '2027-06-10', amount: 0, inTrip: true },
      { date: '2027-06-11', amount: 0, inTrip: true },
      { date: '2027-06-12', amount: 0, inTrip: true },
    ]);
  });

  it('adds integer base amounts exactly (10 + 20 is 30, never 30.000000004)', () => {
    const summary = summarizeBudget(TARGET, [
      expense({ id: 'a', baseAmount: 10, amount: 10 }),
      expense({ id: 'b', baseAmount: 20, amount: 20 }),
    ]);

    expect(summary.totalSpent).toBe(30);
    expect(summary.remaining).toBe(99_970);
  });

  it('stays exact over many small expenses', () => {
    const many = Array.from({ length: 1000 }, (_, index) => expense({ id: `e${index}`, amount: 1, baseAmount: 1 }));
    expect(summarizeBudget(TARGET, many).totalSpent).toBe(1000);
  });

  it('adds converted expenses by their base amount, not the original amount', () => {
    const summary = summarizeBudget(TARGET, [expense(), euroExpense()]);
    expect(summary.totalSpent).toBe(4550 + 2161);
  });

  it('goes negative and past 100% when over budget', () => {
    const summary = summarizeBudget({ ...TARGET, budget: 10_000 }, [expense({ amount: 12_000, baseAmount: 12_000 })]);

    expect(summary.remaining).toBe(-2_000);
    expect(summary.percentSpent).toBe(12_000);
  });

  it('handles a zero budget without dividing by zero', () => {
    const summary = summarizeBudget({ ...TARGET, budget: 0 }, [expense()]);

    expect(summary.totalBudget).toBe(0);
    expect(summary.percentSpent).toBeNull();
    expect(summary.remaining).toBe(-4550);
  });

  it('leaves unconverted expenses and other-currency base amounts out of every total and counts them', () => {
    const stale = euroExpense({ id: 'stale', baseCurrency: 'GBP', baseAmount: 1700 });
    const summary = summarizeBudget(TARGET, [expense(), unconvertedExpense(), stale]);

    expect(summary.totalSpent).toBe(4550);
    expect(summary.unconvertedCount).toBe(2);
    expect(summary.categoryTotals.find(({ category }) => category === 'transport')?.amount).toBe(0);
    expect(summary.dailyTotals.find(({ date }) => date === '2027-06-12')?.amount).toBe(4550);
  });

  it('totals every category, largest first, with ties in category order', () => {
    const summary = summarizeBudget(TARGET, [
      expense({ id: 'a', category: 'shopping', baseAmount: 500 }),
      expense({ id: 'b', category: 'food', baseAmount: 300 }),
      expense({ id: 'c', category: 'food', baseAmount: 300 }),
      expense({ id: 'd', category: 'healthcare', baseAmount: 200 }),
    ]);

    expect(summary.categoryTotals.slice(0, 3)).toEqual([
      { category: 'food', amount: 600, share: 46 },
      { category: 'shopping', amount: 500, share: 39 },
      { category: 'healthcare', amount: 200, share: 15 },
    ]);
    expect(summary.categoryTotals).toHaveLength(8);
    expect(summary.categoryTotals.slice(3).map(({ category }) => category)).toEqual([
      'transport',
      'accommodation',
      'entertainment',
      'activities',
      'other',
    ]);
  });

  it('gives category shares that add up to exactly 100', () => {
    const summary = summarizeBudget(TARGET, [
      expense({ id: 'a', category: 'food', baseAmount: 1 }),
      expense({ id: 'b', category: 'transport', baseAmount: 1 }),
      expense({ id: 'c', category: 'shopping', baseAmount: 1 }),
    ]);

    const shares = summary.categoryTotals.filter(({ amount }) => amount > 0).map(({ share }) => share);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(100);
    expect([...shares].sort()).toEqual([33, 33, 34]);
  });

  it('totals each day, keeping empty trip days and adding days outside the trip', () => {
    const summary = summarizeBudget(TARGET, [
      expense({ id: 'a', date: '2027-06-10', baseAmount: 1000 }),
      expense({ id: 'b', date: '2027-06-10', baseAmount: 250 }),
      expense({ id: 'flight', date: '2027-05-01', baseAmount: 40_000 }),
      expense({ id: 'souvenir', date: '2027-06-20', baseAmount: 900 }),
    ]);

    expect(summary.dailyTotals).toEqual([
      { date: '2027-05-01', amount: 40_000, inTrip: false },
      { date: '2027-06-10', amount: 1250, inTrip: true },
      { date: '2027-06-11', amount: 0, inTrip: true },
      { date: '2027-06-12', amount: 0, inTrip: true },
      { date: '2027-06-20', amount: 900, inTrip: false },
    ]);
    expect(summary.totalSpent).toBe(42_150);
  });
});
