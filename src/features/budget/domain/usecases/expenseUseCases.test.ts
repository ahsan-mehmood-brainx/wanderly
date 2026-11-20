import { type AppDependencies } from '@/core/di/AppDependencies';
import { AppError } from '@/core/errors/AppError';
import { ApiError } from '@/core/http/ApiError';
import { err } from '@/core/result';
import { type StoredTrip } from '@/features/trips/domain/Trip';
import {
  BUDGET_TRIP,
  EXPENSE_DAY,
  euroExpense,
  expense,
  expenseInput,
  seededBudgetDatabase,
  stubFrankfurter,
  unconvertedExpense,
} from '@/testing/budgetFixtures';
import { apiFailure, type FakeHttpClient, FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { ManualClock } from '@/testing/ManualClock';
import { createTestDependencies } from '@/testing/testDependencies';
import { FakeTripOwnerProvider, OTHER_TRIP_OWNER, storedTrip, TRIP_OWNER, TRIPS_NOW } from '@/testing/tripFixtures';

import { type Expense } from '../Expense';

const RATES = { 'EUR>USD': 1.0805, 'JPY>USD': 0.0061, 'USD>EUR': 0.9255, 'JPY>EUR': 0.0057 };

interface SetupOptions {
  readonly trips?: readonly StoredTrip[];
  readonly expenses?: readonly Expense[];
  /** No rate can be fetched: every Frankfurter request fails as offline. */
  readonly offline?: boolean;
  readonly overrides?: Partial<AppDependencies>;
}

async function setup({ trips = [BUDGET_TRIP], expenses = [], offline = false, overrides = {} }: SetupOptions = {}) {
  const storage = await seededBudgetDatabase(trips, expenses);
  const factory = new FakeHttpClientFactory();
  const http: FakeHttpClient = stubFrankfurter(factory, RATES);
  if (offline) http.otherwise(() => apiFailure(new ApiError('offline', 'No connection')));
  const owners = new FakeTripOwnerProvider();
  const dependencies = createTestDependencies({
    database: storage.database,
    clock: new ManualClock(TRIPS_NOW),
    httpClientFactory: factory,
    tripOwnerProvider: owners,
    ...overrides,
  });
  return { ...storage, dependencies, http, owners };
}

const rateRequests = (http: FakeHttpClient) => http.requests.filter(({ path }) => path !== '/currencies');

async function saved(storage: Awaited<ReturnType<typeof setup>>, id: string) {
  const result = await storage.expenseRepository.findById(TRIP_OWNER, id);
  if (!result.ok) throw result.error;
  return result.value;
}

describe('CreateExpense', () => {
  it('saves an expense in the trip currency as its own base amount, without any request', async () => {
    const storage = await setup();

    const outcome = await storage.dependencies.createExpense.execute({ tripId: 'trip-1', input: expenseInput() });

    const expected: Expense = {
      id: 'test-1',
      tripId: 'trip-1',
      title: 'Dinner',
      amount: 4550,
      currency: 'USD',
      baseCurrency: 'USD',
      baseAmount: 4550,
      exchangeRate: { rate: '1', rateDate: EXPENSE_DAY, source: 'identity' },
      category: 'food',
      date: EXPENSE_DAY,
      paymentMethod: 'card',
      notes: '',
      createdAt: TRIPS_NOW,
      updatedAt: TRIPS_NOW,
    };
    expect(outcome).toEqual({ status: 'saved', expense: expected });
    expect(await saved(storage, 'test-1')).toEqual(expected);
    expect(rateRequests(storage.http)).toHaveLength(0);
  });

  it('converts a foreign expense with the rate for its date and remembers the rate', async () => {
    const storage = await setup();

    const outcome = await storage.dependencies.createExpense.execute({
      tripId: 'trip-1',
      input: expenseInput({ title: 'Tram', amount: '20', currency: 'EUR', category: 'transport' }),
    });

    expect(outcome).toMatchObject({
      status: 'saved',
      expense: {
        amount: 2000,
        currency: 'EUR',
        baseCurrency: 'USD',
        baseAmount: 2161,
        exchangeRate: { rate: '1.0805', rateDate: EXPENSE_DAY, source: 'api' },
      },
    });
    expect(rateRequests(storage.http).map(({ path, query }) => [path, query])).toEqual([
      [`/${EXPENSE_DAY}`, { base: 'EUR', symbols: 'USD' }],
    ]);

    await storage.dependencies.createExpense.execute({
      tripId: 'trip-1',
      input: expenseInput({ title: 'Coffee', amount: '3.20', currency: 'EUR' }),
    });
    expect(rateRequests(storage.http)).toHaveLength(1);
    expect((await saved(storage, 'test-2'))?.baseAmount).toBe(346);
  });

  it('uses the latest rate for a future date', async () => {
    const storage = await setup();

    await storage.dependencies.createExpense.execute({
      tripId: 'trip-1',
      input: expenseInput({ amount: '1500', currency: 'JPY', date: '2027-12-01' }),
    });

    expect(rateRequests(storage.http).map(({ path }) => path)).toEqual(['/latest']);
    expect((await saved(storage, 'test-1'))?.baseAmount).toBe(915);
  });

  it('saves unconverted when offline and no rate is cached', async () => {
    const storage = await setup({ offline: true });

    const outcome = await storage.dependencies.createExpense.execute({
      tripId: 'trip-1',
      input: expenseInput({ amount: '1500', currency: 'JPY' }),
    });

    expect(outcome).toMatchObject({
      status: 'saved',
      expense: { amount: 1500, currency: 'JPY', baseCurrency: 'USD', baseAmount: null, exchangeRate: null },
    });
    expect(await saved(storage, 'test-1')).toMatchObject({ baseAmount: null, exchangeRate: null });
  });

  it('uses the nearest earlier cached rate when offline, marked as a fallback with its own date', async () => {
    const storage = await setup({ offline: true });
    await storage.rateCache.save({
      base: 'EUR',
      quote: 'USD',
      requestedDate: '2027-06-10',
      rate: '1.07',
      rateDate: '2027-06-10',
      fetchedAt: 1,
    });

    const outcome = await storage.dependencies.createExpense.execute({
      tripId: 'trip-1',
      input: expenseInput({ amount: '20', currency: 'EUR' }),
    });

    expect(outcome).toMatchObject({
      status: 'saved',
      expense: { baseAmount: 2140, exchangeRate: { rate: '1.07', rateDate: '2027-06-10', source: 'fallback' } },
    });
  });

  it('uses a typed rate when no rate is available', async () => {
    const storage = await setup({ offline: true });

    const outcome = await storage.dependencies.createExpense.execute({
      tripId: 'trip-1',
      input: expenseInput({ amount: '20', currency: 'EUR', manualRate: '1.1' }),
    });

    expect(outcome).toMatchObject({
      status: 'saved',
      expense: { baseAmount: 2200, exchangeRate: { rate: '1.1', rateDate: EXPENSE_DAY, source: 'manual' } },
    });
  });

  it('prefers the published rate over a typed one', async () => {
    const storage = await setup();

    const outcome = await storage.dependencies.createExpense.execute({
      tripId: 'trip-1',
      input: expenseInput({ amount: '20', currency: 'EUR', manualRate: '2' }),
    });

    expect(outcome).toMatchObject({ status: 'saved', expense: { baseAmount: 2161 } });
  });

  it.each([
    ['a currency the API does not support', 'PKR', '5000'],
    ['a missing historical rate', 'GBP', '10'],
  ])('still saves the expense, unconverted, for %s', async (_name, currency, amount) => {
    const storage = await setup();

    const outcome = await storage.dependencies.createExpense.execute({
      tripId: 'trip-1',
      input: expenseInput({ amount, currency }),
    });

    expect(outcome).toMatchObject({ status: 'saved', expense: { currency, baseAmount: null, exchangeRate: null } });
  });

  it('saves nothing for invalid input', async () => {
    const storage = await setup();

    const outcome = await storage.dependencies.createExpense.execute({
      tripId: 'trip-1',
      input: expenseInput({ title: '', amount: '-5' }),
    });

    expect(outcome).toEqual({ status: 'invalid', errors: { fields: { title: 'required', amount: 'notPositive' } } });
    const all = await storage.expenseRepository.listByTrip(TRIP_OWNER, 'trip-1');
    expect(all.ok && all.value).toEqual([]);
    expect(rateRequests(storage.http)).toHaveLength(0);
  });

  it('fails with notFound for a trip that does not exist', async () => {
    const storage = await setup({ trips: [] });
    const outcome = await storage.dependencies.createExpense.execute({ tripId: 'trip-1', input: expenseInput() });
    expect(outcome.status === 'failed' && outcome.error.kind).toBe('notFound');
  });

  it('fails with unauthorized when signed out', async () => {
    const storage = await setup();
    storage.owners.ownerId = null;
    const outcome = await storage.dependencies.createExpense.execute({ tripId: 'trip-1', input: expenseInput() });
    expect(outcome.status === 'failed' && outcome.error.kind).toBe('unauthorized');
  });

  it('reports a storage failure', async () => {
    const storage = await setup();
    jest
      .spyOn(storage.dependencies.expenseRepository, 'insert')
      .mockResolvedValueOnce(err(new AppError('storage', 'x')));
    const outcome = await storage.dependencies.createExpense.execute({ tripId: 'trip-1', input: expenseInput() });
    expect(outcome.status === 'failed' && outcome.error.kind).toBe('storage');
  });
});

describe('UpdateExpense', () => {
  it('saves new details without converting again when amount, currency and date are unchanged', async () => {
    const storage = await setup({ expenses: [euroExpense({ createdAt: 1 })] });

    const outcome = await storage.dependencies.updateExpense.execute({
      id: 'exp-eur',
      input: expenseInput({ title: 'Metro', amount: '20', currency: 'EUR', category: 'transport', notes: 'Day pass' }),
    });

    expect(outcome).toMatchObject({
      status: 'saved',
      expense: { title: 'Metro', notes: 'Day pass', baseAmount: 2161, createdAt: 1, updatedAt: TRIPS_NOW },
    });
    expect(rateRequests(storage.http)).toHaveLength(0);
    expect((await saved(storage, 'exp-eur'))?.title).toBe('Metro');
  });

  it('converts again when the amount changes', async () => {
    const storage = await setup({ expenses: [euroExpense()] });

    const outcome = await storage.dependencies.updateExpense.execute({
      id: 'exp-eur',
      input: expenseInput({ title: 'Tram tickets', amount: '40', currency: 'EUR', category: 'transport' }),
    });

    expect(outcome).toMatchObject({ status: 'saved', expense: { amount: 4000, baseAmount: 4322 } });
  });

  it('becomes an identity conversion when the currency changes to the trip currency', async () => {
    const storage = await setup({ expenses: [euroExpense()] });

    const outcome = await storage.dependencies.updateExpense.execute({
      id: 'exp-eur',
      input: expenseInput({ title: 'Tram tickets', amount: '25', currency: 'USD', category: 'transport' }),
    });

    expect(outcome).toMatchObject({
      status: 'saved',
      expense: { currency: 'USD', baseAmount: 2500, exchangeRate: { rate: '1', source: 'identity' } },
    });
  });

  it('is notFound for a missing expense', async () => {
    const storage = await setup();
    const outcome = await storage.dependencies.updateExpense.execute({ id: 'gone', input: expenseInput() });
    expect(outcome.status === 'failed' && outcome.error.kind).toBe('notFound');
  });

  it("is notFound for another account's expense and leaves it unchanged", async () => {
    const storage = await setup();
    await storage.tripRepository.insert(OTHER_TRIP_OWNER, storedTrip({ id: 'their-trip' }));
    await storage.expenseRepository.insert(OTHER_TRIP_OWNER, expense({ id: 'theirs', tripId: 'their-trip' }));

    const outcome = await storage.dependencies.updateExpense.execute({
      id: 'theirs',
      input: expenseInput({ title: 'Taken' }),
    });

    expect(outcome.status === 'failed' && outcome.error.kind).toBe('notFound');
    const theirs = await storage.expenseRepository.findById(OTHER_TRIP_OWNER, 'theirs');
    expect(theirs.ok && theirs.value?.title).toBe('Dinner');
  });

  it('reports invalid input and saves nothing', async () => {
    const storage = await setup({ expenses: [expense()] });
    const outcome = await storage.dependencies.updateExpense.execute({
      id: 'exp-1',
      input: expenseInput({ amount: '0' }),
    });
    expect(outcome).toEqual({ status: 'invalid', errors: { fields: { amount: 'notPositive' } } });
    expect((await saved(storage, 'exp-1'))?.amount).toBe(4550);
  });
});

describe('GetExpense and DeleteExpense', () => {
  it('reads an expense', async () => {
    const storage = await setup({ expenses: [euroExpense()] });
    expect(await storage.dependencies.getExpense.execute('exp-eur')).toEqual({ ok: true, value: euroExpense() });
  });

  it('is notFound for a missing expense and unauthorized when signed out', async () => {
    const storage = await setup();
    const missing = await storage.dependencies.getExpense.execute('gone');
    expect(!missing.ok && missing.error.kind).toBe('notFound');

    storage.owners.ownerId = null;
    const signedOut = await storage.dependencies.getExpense.execute('gone');
    expect(!signedOut.ok && signedOut.error.kind).toBe('unauthorized');
  });

  it('deletes an expense, and a second delete is notFound', async () => {
    const storage = await setup({ expenses: [expense()] });

    expect((await storage.dependencies.deleteExpense.execute('exp-1')).ok).toBe(true);
    expect(await saved(storage, 'exp-1')).toBeNull();
    const again = await storage.dependencies.deleteExpense.execute('exp-1');
    expect(!again.ok && again.error.kind).toBe('notFound');
  });
});

describe('GetTripBudget', () => {
  it('returns the trip and its expenses without any request when all are converted', async () => {
    const storage = await setup({ expenses: [expense({ date: '2027-06-13' }), euroExpense({ date: '2027-06-11' })] });

    const result = await storage.dependencies.getTripBudget.execute('trip-1');

    expect(result.ok && result.value.trip).toEqual(BUDGET_TRIP);
    expect(result.ok && result.value.expenses.map(({ id }) => id)).toEqual(['exp-eur', 'exp-1']);
    expect(rateRequests(storage.http)).toHaveLength(0);
  });

  it('is notFound for a missing trip and unauthorized when signed out', async () => {
    const storage = await setup({ trips: [] });
    const missing = await storage.dependencies.getTripBudget.execute('trip-1');
    expect(!missing.ok && missing.error.kind).toBe('notFound');

    storage.owners.ownerId = null;
    const signedOut = await storage.dependencies.getTripBudget.execute('trip-1');
    expect(!signedOut.ok && signedOut.error.kind).toBe('unauthorized');
  });

  it('converts expenses saved offline once a rate is available, and saves them', async () => {
    const storage = await setup({ expenses: [unconvertedExpense()] });

    const result = await storage.dependencies.getTripBudget.execute('trip-1');

    const expected = { baseCurrency: 'USD', baseAmount: 915, exchangeRate: { rate: '0.0061', source: 'api' } };
    expect(result.ok && result.value.expenses[0]).toMatchObject(expected);
    expect(await saved(storage, 'exp-jpy')).toMatchObject({ ...expected, updatedAt: TRIPS_NOW });
  });

  it('keeps expenses unconverted, without failing, while still offline', async () => {
    const storage = await setup({
      expenses: [unconvertedExpense({ createdAt: 2 }), expense({ createdAt: 1 })],
      offline: true,
    });

    const result = await storage.dependencies.getTripBudget.execute('trip-1');

    expect(result.ok && result.value.expenses.map(({ id, baseAmount }) => [id, baseAmount])).toEqual([
      ['exp-1', 4550],
      ['exp-jpy', null],
    ]);
  });

  it('converts every expense into a new trip currency and saves the new base amounts', async () => {
    const storage = await setup({
      trips: [{ ...BUDGET_TRIP, currency: 'EUR', budget: 90_000 }],
      expenses: [expense({ id: 'usd', createdAt: 1 }), euroExpense({ id: 'eur', createdAt: 2 })],
    });

    const result = await storage.dependencies.getTripBudget.execute('trip-1');

    expect(result.ok && result.value.expenses).toEqual([
      expect.objectContaining({
        id: 'usd',
        baseCurrency: 'EUR',
        baseAmount: 4211,
        exchangeRate: { rate: '0.9255', rateDate: EXPENSE_DAY, source: 'api' },
      }),
      expect.objectContaining({
        id: 'eur',
        baseCurrency: 'EUR',
        baseAmount: 2000,
        exchangeRate: { rate: '1', rateDate: EXPENSE_DAY, source: 'identity' },
      }),
    ]);
    expect(await saved(storage, 'usd')).toMatchObject({ baseCurrency: 'EUR', baseAmount: 4211 });
  });

  it('marks expenses it cannot convert into the new currency as unconverted, never mixing currencies', async () => {
    const storage = await setup({
      trips: [{ ...BUDGET_TRIP, currency: 'EUR', budget: 90_000 }],
      expenses: [expense({ id: 'usd', createdAt: 1 }), euroExpense({ id: 'eur', createdAt: 2 })],
      offline: true,
    });

    const result = await storage.dependencies.getTripBudget.execute('trip-1');

    expect(
      result.ok && result.value.expenses.map(({ id, baseCurrency, baseAmount }) => [id, baseCurrency, baseAmount]),
    ).toEqual([
      ['usd', 'EUR', null],
      ['eur', 'EUR', 2000],
    ]);
    expect(await saved(storage, 'usd')).toMatchObject({ baseCurrency: 'EUR', baseAmount: null, exchangeRate: null });
  });

  it('keeps a manually converted expense as it is', async () => {
    const manual = euroExpense({
      baseAmount: 2200,
      exchangeRate: { rate: '1.1', rateDate: EXPENSE_DAY, source: 'manual' },
    });
    const storage = await setup({ expenses: [manual] });

    const result = await storage.dependencies.getTripBudget.execute('trip-1');

    expect(result.ok && result.value.expenses).toEqual([manual]);
    expect(rateRequests(storage.http)).toHaveLength(0);
  });

  it('still returns the expenses when saving the new conversions fails', async () => {
    const storage = await setup({ expenses: [unconvertedExpense()] });
    jest
      .spyOn(storage.dependencies.expenseRepository, 'updateConversions')
      .mockResolvedValueOnce(err(new AppError('storage', 'locked')));

    const result = await storage.dependencies.getTripBudget.execute('trip-1');

    expect(result.ok && result.value.expenses.map(({ id }) => id)).toEqual(['exp-jpy']);
  });
});

describe('PreviewExchangeRate', () => {
  it('returns the rate for the form', async () => {
    const storage = await setup();
    const result = await storage.dependencies.previewExchangeRate.execute({
      from: 'EUR',
      to: 'USD',
      date: EXPENSE_DAY,
    });
    expect(result).toEqual({ ok: true, value: { rate: '1.0805', rateDate: EXPENSE_DAY, source: 'api' } });
  });

  it('answers the same currency with rate 1 and no request', async () => {
    const storage = await setup();
    const result = await storage.dependencies.previewExchangeRate.execute({
      from: 'USD',
      to: 'USD',
      date: EXPENSE_DAY,
    });
    expect(result).toEqual({ ok: true, value: { rate: '1', rateDate: EXPENSE_DAY, source: 'identity' } });
    expect(rateRequests(storage.http)).toHaveLength(0);
  });

  it('passes on the failure when no rate is available', async () => {
    const storage = await setup({ offline: true });
    const result = await storage.dependencies.previewExchangeRate.execute({
      from: 'EUR',
      to: 'USD',
      date: EXPENSE_DAY,
    });
    expect(!result.ok && result.error.kind).toBe('offline');
  });
});
