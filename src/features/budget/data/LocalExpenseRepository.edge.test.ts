import { BUDGET_TRIP, euroExpense, seededBudgetDatabase, unconvertedExpense } from '@/testing/budgetFixtures';
import { TRIP_OWNER } from '@/testing/tripFixtures';

import { type ExpenseConversionUpdate } from '../domain/repositories';

const converted = (id: string, basis: ExpenseConversionUpdate['basis']): ExpenseConversionUpdate => ({
  id,
  baseCurrency: 'USD',
  baseAmount: 915,
  exchangeRate: { rate: '0.0061', rateDate: '2027-06-12', source: 'api' },
  updatedAt: 500,
  basis,
});

const jpyBasis = { amount: 1500, currency: 'JPY', date: '2027-06-12', baseCurrency: 'USD' };

describe('LocalExpenseRepository.updateConversions with a basis', () => {
  it('writes the conversion while the expense still has the amount, currency, date and base currency it was read with', async () => {
    const { expenseRepository } = await seededBudgetDatabase([BUDGET_TRIP], [unconvertedExpense()]);

    const result = await expenseRepository.updateConversions(TRIP_OWNER, [converted('exp-jpy', jpyBasis)]);

    expect(result.ok).toBe(true);
    const stored = await expenseRepository.findById(TRIP_OWNER, 'exp-jpy');
    expect(stored.ok && stored.value).toMatchObject({ baseAmount: 915, updatedAt: 500 });
  });

  it.each([
    ['amount', { amount: 1000 }],
    ['currency', { currency: 'EUR' }],
    ['date', { date: '2027-06-11' }],
    ['base currency', { baseCurrency: 'EUR' }],
  ])('skips, without failing, an expense whose %s changed since it was read', async (_, changed) => {
    const { expenseRepository } = await seededBudgetDatabase([BUDGET_TRIP], [unconvertedExpense()]);

    const result = await expenseRepository.updateConversions(TRIP_OWNER, [
      converted('exp-jpy', { ...jpyBasis, ...changed }),
    ]);

    expect(result.ok).toBe(true);
    const stored = await expenseRepository.findById(TRIP_OWNER, 'exp-jpy');
    expect(stored.ok && stored.value).toMatchObject({ baseAmount: null, exchangeRate: null });
  });

  it('still writes the other expenses in the batch when one is skipped', async () => {
    const { expenseRepository } = await seededBudgetDatabase(
      [BUDGET_TRIP],
      [unconvertedExpense(), unconvertedExpense({ id: 'exp-jpy-2' })],
    );

    const result = await expenseRepository.updateConversions(TRIP_OWNER, [
      converted('exp-jpy', { ...jpyBasis, amount: 999 }),
      converted('exp-jpy-2', jpyBasis),
    ]);

    expect(result.ok).toBe(true);
    const skipped = await expenseRepository.findById(TRIP_OWNER, 'exp-jpy');
    const written = await expenseRepository.findById(TRIP_OWNER, 'exp-jpy-2');
    expect(skipped.ok && skipped.value?.baseAmount).toBeNull();
    expect(written.ok && written.value?.baseAmount).toBe(915);
  });

  it('is still notFound, changing nothing, when an expense in the batch was deleted', async () => {
    const { expenseRepository } = await seededBudgetDatabase([BUDGET_TRIP], [euroExpense({ id: 'kept' })]);

    const result = await expenseRepository.updateConversions(TRIP_OWNER, [
      { ...converted('kept', { amount: 2000, currency: 'EUR', date: '2027-06-12', baseCurrency: 'USD' }) },
      converted('gone', jpyBasis),
    ]);

    expect(!result.ok && result.error.kind).toBe('notFound');
    const kept = await expenseRepository.findById(TRIP_OWNER, 'kept');
    expect(kept.ok && kept.value?.baseAmount).toBe(2161);
  });
});
