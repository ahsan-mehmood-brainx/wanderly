import {
  BUDGET_TRIP,
  expenseInput,
  seededBudgetDatabase,
  stubFrankfurter,
  unconvertedExpense,
} from '@/testing/budgetFixtures';
import { FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { ManualClock } from '@/testing/ManualClock';
import { createTestDependencies } from '@/testing/testDependencies';
import { FakeTripOwnerProvider, storedTrip, TRIP_OWNER, TRIPS_NOW } from '@/testing/tripFixtures';

import { type Expense } from '../Expense';
import { type ConversionRequest } from './ExpenseConverter';

const RATES = { 'JPY>USD': 0.0061, 'JPY>EUR': 0.0057, 'USD>EUR': 0.9255 };

async function setup(expenses: readonly Expense[]) {
  const storage = await seededBudgetDatabase([BUDGET_TRIP], expenses);
  const factory = new FakeHttpClientFactory();
  stubFrankfurter(factory, RATES);
  const dependencies = createTestDependencies({
    database: storage.database,
    clock: new ManualClock(TRIPS_NOW),
    httpClientFactory: factory,
    tripOwnerProvider: new FakeTripOwnerProvider(),
  });
  return { ...storage, dependencies };
}

type Storage = Awaited<ReturnType<typeof setup>>;

/** Holds the next conversion until `release`, as a slow exchange-rate API would. */
function holdNextConversion({ dependencies }: Storage) {
  const { expenseConverter } = dependencies;
  const original = expenseConverter.convert.bind(expenseConverter);
  let release: () => void = () => undefined;
  let markStarted: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  jest.spyOn(expenseConverter, 'convert').mockImplementationOnce(async (request: ConversionRequest) => {
    markStarted();
    await gate;
    return original(request);
  });
  return { started, release: () => release() };
}

async function stored(storage: Storage, id: string) {
  const result = await storage.expenseRepository.findById(TRIP_OWNER, id);
  if (!result.ok) throw result.error;
  return result.value;
}

describe('GetTripBudget conversions racing other changes', () => {
  it('does not overwrite the base amount of an expense whose amount was edited while it was being converted', async () => {
    const storage = await setup([unconvertedExpense()]);
    const held = holdNextConversion(storage);

    const load = storage.dependencies.getTripBudget.execute('trip-1');
    await held.started;
    const edited = await storage.dependencies.updateExpense.execute({
      id: 'exp-jpy',
      input: expenseInput({ title: 'Ramen', amount: '3000', currency: 'JPY' }),
    });
    expect(edited).toMatchObject({ status: 'saved', expense: { amount: 3000, baseAmount: 1830 } });
    held.release();
    await load;

    // 3000 JPY at 0.0061, not the 1500 JPY the stale conversion was computed for.
    expect(await stored(storage, 'exp-jpy')).toMatchObject({ amount: 3000, baseCurrency: 'USD', baseAmount: 1830 });
  });

  it('does not overwrite an expense moved to another currency while it was being converted', async () => {
    const storage = await setup([unconvertedExpense()]);
    const held = holdNextConversion(storage);

    const load = storage.dependencies.getTripBudget.execute('trip-1');
    await held.started;
    await storage.dependencies.updateExpense.execute({
      id: 'exp-jpy',
      input: expenseInput({ title: 'Ramen', amount: '15', currency: 'USD' }),
    });
    held.release();
    await load;

    expect(await stored(storage, 'exp-jpy')).toMatchObject({
      amount: 1500,
      currency: 'USD',
      baseAmount: 1500,
      exchangeRate: { source: 'identity' },
    });
  });

  it('keeps converting the other expenses when one was edited meanwhile', async () => {
    const storage = await setup([
      unconvertedExpense(),
      unconvertedExpense({ id: 'exp-jpy-2', title: 'Sushi', amount: 2000, createdAt: TRIPS_NOW + 1 }),
    ]);
    const held = holdNextConversion(storage);

    const load = storage.dependencies.getTripBudget.execute('trip-1');
    await held.started;
    await storage.dependencies.updateExpense.execute({
      id: 'exp-jpy',
      input: expenseInput({ title: 'Ramen', amount: '3000', currency: 'JPY' }),
    });
    held.release();
    const result = await load;

    expect(result.ok).toBe(true);
    expect(await stored(storage, 'exp-jpy-2')).toMatchObject({ baseCurrency: 'USD', baseAmount: 1220 });
    expect(await stored(storage, 'exp-jpy')).toMatchObject({ amount: 3000, baseAmount: 1830 });
  });

  it('does not write old-currency amounts after a newer load converted into the new trip currency', async () => {
    const storage = await setup([unconvertedExpense()]);
    const held = holdNextConversion(storage);

    const stale = storage.dependencies.getTripBudget.execute('trip-1');
    await held.started;
    const euroTrip = storedTrip({ ...BUDGET_TRIP, currency: 'EUR', budget: 90_000 });
    const changed = await storage.tripRepository.update(TRIP_OWNER, euroTrip);
    expect(changed.ok).toBe(true);
    await storage.dependencies.getTripBudget.execute('trip-1');
    held.release();
    await stale;

    expect(await stored(storage, 'exp-jpy')).toMatchObject({ baseCurrency: 'EUR', baseAmount: 855 });
  });
});
