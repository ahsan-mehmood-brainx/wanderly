import { AppError } from '@/core/errors/AppError';
import { err, ok } from '@/core/result';
import { type LocalDate } from '@/features/trips/domain/localDate';
import { BUDGET_TRIP, EXPENSE_DAY, seededBudgetDatabase, unconvertedExpense } from '@/testing/budgetFixtures';
import { ManualClock } from '@/testing/ManualClock';
import { FakeTripOwnerProvider, TRIP_OWNER, TRIPS_NOW } from '@/testing/tripFixtures';

import { type Expense } from '../Expense';
import { type ExchangeRateInfo } from '../ExchangeRate';
import { type ExchangeRateRepository } from '../repositories';
import { ExpenseConverter } from './ExpenseConverter';
import { GetTripBudget, PreviewExchangeRate } from './expenseUseCases';

type RateAnswer = (from: string, to: string, date: LocalDate) => ExchangeRateInfo | null;

function fakeRates(answer: RateAnswer, supported: readonly string[] = ['EUR', 'JPY', 'USD']) {
  const getRate = jest.fn(async (from: string, to: string, date: LocalDate) => {
    const info = answer(from, to, date);
    return info ? ok(info) : err(new AppError('offline', 'No connection'));
  });
  const supportedCurrencies = jest.fn(async () => ok(supported));
  const repository: ExchangeRateRepository = { getRate, supportedCurrencies };
  return { repository, getRate, supportedCurrencies };
}

async function setup(expenses: readonly Expense[], rates: ExchangeRateRepository) {
  const storage = await seededBudgetDatabase([BUDGET_TRIP], expenses);
  const getTripBudget = new GetTripBudget(
    storage.expenseRepository,
    storage.tripRepository,
    new FakeTripOwnerProvider(),
    new ExpenseConverter(rates),
    new ManualClock(TRIPS_NOW),
  );
  return { storage, getTripBudget };
}

async function storedExpenses(storage: Awaited<ReturnType<typeof setup>>['storage']) {
  const listed = await storage.expenseRepository.listByTrip(TRIP_OWNER, 'trip-1');
  if (!listed.ok) throw listed.error;
  return listed.value;
}

describe('GetTripBudget lookups', () => {
  it('looks a failing currency and date up only once per load', async () => {
    const rates = fakeRates(() => null);
    const { getTripBudget } = await setup(
      [
        unconvertedExpense({ id: 'a' }),
        unconvertedExpense({ id: 'b' }),
        unconvertedExpense({ id: 'c', date: '2027-06-11' }),
      ],
      rates.repository,
    );

    const result = await getTripBudget.execute('trip-1');

    expect(result.ok).toBe(true);
    expect(rates.getRate).toHaveBeenCalledTimes(2);
  });

  it('reuses a found rate for expenses sharing a currency and date', async () => {
    const rates = fakeRates(() => ({ rate: '0.0061', rateDate: EXPENSE_DAY, source: 'api' }));
    const { getTripBudget } = await setup(
      [unconvertedExpense({ id: 'a' }), unconvertedExpense({ id: 'b', amount: 3000 })],
      rates.repository,
    );

    const result = await getTripBudget.execute('trip-1');

    expect(rates.getRate).toHaveBeenCalledTimes(1);
    expect(result.ok && result.value.expenses.map((item) => item.baseAmount).sort()).toEqual([1830, 915]);
  });

  it('makes no lookup for a currency the rate API does not publish', async () => {
    const rates = fakeRates(() => ({ rate: '1', rateDate: EXPENSE_DAY, source: 'api' }), ['EUR', 'USD']);
    const { getTripBudget } = await setup([unconvertedExpense({ id: 'a' })], rates.repository);

    const result = await getTripBudget.execute('trip-1');

    expect(rates.getRate).not.toHaveBeenCalled();
    expect(result.ok && result.value.expenses[0]?.baseAmount).toBeNull();
  });
});

describe('GetTripBudget replacing approximate conversions', () => {
  const fallbackExpense = unconvertedExpense({
    id: 'approx',
    baseAmount: 900,
    exchangeRate: { rate: '0.006', rateDate: '2027-06-01', source: 'fallback' },
  });

  it('replaces a fallback rate with the published rate for the date', async () => {
    const rates = fakeRates(() => ({ rate: '0.0061', rateDate: EXPENSE_DAY, source: 'api' }));
    const { storage, getTripBudget } = await setup([fallbackExpense], rates.repository);

    await getTripBudget.execute('trip-1');

    expect((await storedExpenses(storage))[0]).toMatchObject({
      baseAmount: 915,
      exchangeRate: { rate: '0.0061', rateDate: EXPENSE_DAY, source: 'api' },
    });
  });

  it('keeps the stored fallback conversion when the lookup still fails', async () => {
    const rates = fakeRates(() => null);
    const { storage, getTripBudget } = await setup([fallbackExpense], rates.repository);

    await getTripBudget.execute('trip-1');

    expect((await storedExpenses(storage))[0]).toMatchObject({ baseAmount: 900, exchangeRate: { source: 'fallback' } });
  });

  it('fetches the rate for the date of an expense converted before that date, once it has passed', async () => {
    const convertedEarly = unconvertedExpense({
      id: 'prepaid',
      baseAmount: 900,
      exchangeRate: { rate: '0.006', rateDate: '2027-05-31', source: 'api' },
      updatedAt: Date.UTC(2027, 4, 31, 12),
    });
    const rates = fakeRates(() => ({ rate: '0.0061', rateDate: EXPENSE_DAY, source: 'api' }));
    const { storage, getTripBudget } = await setup([convertedEarly], rates.repository);

    await getTripBudget.execute('trip-1');

    expect(rates.getRate).toHaveBeenCalledWith('JPY', 'USD', EXPENSE_DAY, undefined);
    expect((await storedExpenses(storage))[0]).toMatchObject({
      baseAmount: 915,
      exchangeRate: { rateDate: EXPENSE_DAY },
    });
  });

  it("still fetches the date's rate after only the title or notes were edited past the date", async () => {
    const editedLater = unconvertedExpense({
      id: 'prepaid',
      title: 'Renamed after the trip',
      baseAmount: 900,
      exchangeRate: { rate: '0.006', rateDate: '2027-05-31', source: 'api' },
      updatedAt: Date.UTC(2027, 5, 14, 12),
    });
    const rates = fakeRates(() => ({ rate: '0.0061', rateDate: EXPENSE_DAY, source: 'api' }));
    const { storage, getTripBudget } = await setup([editedLater], rates.repository);

    await getTripBudget.execute('trip-1');

    expect((await storedExpenses(storage))[0]).toMatchObject({
      baseAmount: 915,
      exchangeRate: { rate: '0.0061', rateDate: EXPENSE_DAY },
    });
  });

  it('saves nothing when a weekend expense is re-checked and the rate is the same', async () => {
    const weekend = unconvertedExpense({
      id: 'weekend',
      baseAmount: 900,
      exchangeRate: { rate: '0.006', rateDate: '2027-06-11', source: 'api' },
      updatedAt: Date.UTC(2027, 5, 12, 9),
    });
    // The API answers a Saturday with Friday's rate, the one already stored.
    const rates = fakeRates(() => ({ rate: '0.006', rateDate: '2027-06-11', source: 'api' }));
    const { storage, getTripBudget } = await setup([weekend], rates.repository);
    const updateConversions = jest.spyOn(storage.expenseRepository, 'updateConversions');

    await getTripBudget.execute('trip-1');

    expect(updateConversions).not.toHaveBeenCalled();
    expect((await storedExpenses(storage))[0]).toMatchObject({ updatedAt: Date.UTC(2027, 5, 12, 9) });
  });
});

describe('PreviewExchangeRate', () => {
  it('reports no rate without a lookup for a currency the API does not publish', async () => {
    const rates = fakeRates(() => ({ rate: '1', rateDate: EXPENSE_DAY, source: 'api' }), ['EUR', 'USD']);
    const preview = new PreviewExchangeRate(rates.repository);

    const result = await preview.execute({ from: 'PKR', to: 'USD', date: EXPENSE_DAY });

    expect(result).toMatchObject({ ok: false, error: { kind: 'notFound' } });
    expect(rates.getRate).not.toHaveBeenCalled();
  });
});
