import { expense } from '@/testing/budgetFixtures';

import { convertMinor, parseDecimalRate, percentSpentBasisPoints, summarizeBudget } from './budgetCalculations';

const TARGET = { budget: 100_000, currency: 'USD', startDate: '2027-06-10', endDate: '2027-06-14' };

describe('budget calculations edge cases', () => {
  it('converts into and out of a three-decimal currency (KWD) exactly', () => {
    // 12.345 KWD at 3.2551 USD = 40.1842... USD
    expect(convertMinor(12_345, 'KWD', 'USD', '3.2551')).toBe(4018);
    // 100.00 USD at 0.30721 KWD = 30.721 KWD
    expect(convertMinor(10_000, 'USD', 'KWD', '0.30721')).toBe(30_721);
  });

  it('rounds exactly half a yen up when converting into a currency without minor units', () => {
    // 0.01 EUR at 150 = 1.5 JPY → 2; 0.01 EUR at 149.9 = 1.499 JPY → 1
    expect(convertMinor(1, 'EUR', 'JPY', '150')).toBe(2);
    expect(convertMinor(1, 'EUR', 'JPY', '149.9')).toBe(1);
  });

  it.each([-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])('refuses the amount %p', (amount) => {
    expect(() => convertMinor(amount, 'USD', 'EUR', '0.9')).toThrow(RangeError);
  });

  it.each([
    [' 0.50 ', '0.5'],
    ['007', '7'],
    ['1,25', '1.25'],
  ])('normalises the typed rate %p to %p', (text, expected) => {
    expect(parseDecimalRate(text)).toBe(expected);
  });

  it.each(['1,000.5', '.5', '5.', '+1', '1 000'])('rejects the ambiguous or partial rate %p', (text) => {
    expect(parseDecimalRate(text)).toBeNull();
  });

  it('treats a negative budget like a zero budget: no percentage', () => {
    expect(percentSpentBasisPoints(100, -1)).toBeNull();
  });

  it('gives three equal categories shares of 34, 33 and 33 in category order', () => {
    const summary = summarizeBudget(TARGET, [
      expense({ id: 'a', category: 'food', amount: 1000, baseAmount: 1000 }),
      expense({ id: 'b', category: 'transport', amount: 1000, baseAmount: 1000 }),
      expense({ id: 'c', category: 'shopping', amount: 1000, baseAmount: 1000 }),
    ]);

    const shares = Object.fromEntries(summary.categoryTotals.map(({ category, share }) => [category, share]));
    expect(shares).toMatchObject({ food: 34, transport: 33, shopping: 33, other: 0 });
    expect(summary.categoryTotals.reduce((sum, { share }) => sum + share, 0)).toBe(100);
  });

  it('keeps a tiny category at 0% without breaking the 100% total', () => {
    const summary = summarizeBudget(TARGET, [
      expense({ id: 'big', category: 'accommodation', amount: 1_000_000, baseAmount: 1_000_000 }),
      expense({ id: 'tiny', category: 'food', amount: 1, baseAmount: 1 }),
    ]);

    const byCategory = new Map(summary.categoryTotals.map((total) => [total.category, total]));
    expect(byCategory.get('accommodation')?.share).toBe(100);
    expect(byCategory.get('food')).toMatchObject({ amount: 1, share: 0 });
  });

  it('lists a day before the trip with its expenses, marked outside the trip, ahead of the trip days', () => {
    const summary = summarizeBudget(TARGET, [expense({ id: 'early', date: '2027-06-01', baseAmount: 500 })]);

    expect(summary.dailyTotals[0]).toEqual({ date: '2027-06-01', amount: 500, inTrip: false });
    expect(summary.dailyTotals).toHaveLength(6);
    expect(summary.totalSpent).toBe(500);
  });

  it('lists the single day of a one-day trip', () => {
    const summary = summarizeBudget({ ...TARGET, startDate: '2027-06-10', endDate: '2027-06-10' }, []);
    expect(summary.dailyTotals).toEqual([{ date: '2027-06-10', amount: 0, inTrip: true }]);
  });

  it('walks a trip across a month and year end without skipping or repeating a day', () => {
    const summary = summarizeBudget({ ...TARGET, startDate: '2027-12-30', endDate: '2028-01-02' }, []);
    expect(summary.dailyTotals.map(({ date }) => date)).toEqual([
      '2027-12-30',
      '2027-12-31',
      '2028-01-01',
      '2028-01-02',
    ]);
  });

  it('lists every day of the longest allowed trip (366 days, leap year)', () => {
    const summary = summarizeBudget({ ...TARGET, startDate: '2028-01-01', endDate: '2028-12-31' }, [
      expense({ id: 'last', date: '2028-12-31', baseAmount: 100 }),
    ]);
    expect(summary.dailyTotals).toHaveLength(366);
    expect(summary.dailyTotals.at(-1)).toEqual({ date: '2028-12-31', amount: 100, inTrip: true });
  });

  it('counts an over-budget spend exactly with large amounts', () => {
    const summary = summarizeBudget({ ...TARGET, budget: 1 }, [
      expense({ id: 'x', amount: 99_999_999, baseAmount: 99_999_999 }),
      expense({ id: 'y', amount: 99_999_999, baseAmount: 99_999_999 }),
    ]);
    expect(summary).toMatchObject({
      totalSpent: 199_999_998,
      remaining: -199_999_997,
      percentSpent: 1_999_999_980_000,
    });
  });
});
