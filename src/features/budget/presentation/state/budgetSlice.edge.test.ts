import { type Result } from '@/core/result';
import { type AppError } from '@/core/errors/AppError';
import { loadTrips, updateTrip } from '@/features/trips/presentation/state/tripsSlice';
import {
  BUDGET_TRIP,
  euroExpense,
  expense,
  expenseInput,
  loadAndConvertTripBudget,
  seededBudgetDatabase,
  stubFrankfurter,
} from '@/testing/budgetFixtures';
import { createTestStore } from '@/testing/createTestStore';
import { FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { ManualClock } from '@/testing/ManualClock';
import { createTestDependencies } from '@/testing/testDependencies';
import { FakeTripOwnerProvider, TRIP_OWNER, TRIPS_NOW, tripInput } from '@/testing/tripFixtures';

import { type TripBudget } from '../../domain/usecases/expenseUseCases';
import { createExpense, deleteExpense, loadTripExpenses, retryConversions } from './budgetSlice';
import {
  selectBudgetConverted,
  selectBudgetLoadStatus,
  selectBudgetRunning,
  selectBudgetSummary,
  selectExpenseById,
  selectTripExpenses,
} from './selectors';

const RATES = { 'EUR>USD': 1.0805, 'USD>EUR': 0.9255 };
const dinner = expense({ id: 'dinner', date: '2027-06-11', createdAt: 1 });
const tram = euroExpense({ id: 'tram', date: '2027-06-13', createdAt: 2 });

async function setup() {
  const storage = await seededBudgetDatabase([BUDGET_TRIP], [dinner, tram]);
  const factory = new FakeHttpClientFactory();
  stubFrankfurter(factory, RATES);
  const dependencies = createTestDependencies({
    database: storage.database,
    tripOwnerProvider: new FakeTripOwnerProvider(),
    clock: new ManualClock(TRIPS_NOW),
    httpClientFactory: factory,
  });
  const store = createTestStore(dependencies);
  await store.dispatch(loadTrips());
  return { ...storage, dependencies, store };
}

/**
 * Makes the next `getTripBudget` (or `getTripExpenses`) run read SQLite as usual but
 * hold its result until `release` is called. Awaiting `read` guarantees the run has
 * read SQLite, so a change made afterwards lands while its (now stale) result is in flight.
 */
function holdNextLoad(useCase: { execute: (tripId: string) => Promise<Result<TripBudget, AppError>> }) {
  const original = useCase.execute.bind(useCase);
  let release: () => void = () => undefined;
  let markRead: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const read = new Promise<void>((resolve) => {
    markRead = resolve;
  });
  jest.spyOn(useCase, 'execute').mockImplementationOnce(async (tripId: string) => {
    const result = await original(tripId);
    markRead();
    await gate;
    return result;
  });
  return { read, release: () => release() };
}

type Store = Awaited<ReturnType<typeof setup>>['store'];

const ids = (store: Store) => selectTripExpenses(store.getState(), 'trip-1').map(({ id }) => id);

const changeCurrencyToEuro = (store: Store) =>
  store.dispatch(
    updateTrip({
      id: 'trip-1',
      input: tripInput({
        startDate: BUDGET_TRIP.startDate,
        endDate: BUDGET_TRIP.endDate,
        budget: '900',
        currency: 'EUR',
      }),
    }),
  );

describe('budget state edge cases', () => {
  it('reconverts into the new currency when the currency changes while the first conversion is still running', async () => {
    const { store, dependencies } = await setup();
    await store.dispatch(loadTripExpenses('trip-1'));
    const held = holdNextLoad(dependencies.getTripBudget);

    const retry = store.dispatch(retryConversions('trip-1'));
    await held.read;
    const changed = await changeCurrencyToEuro(store);
    expect(changed.payload).toMatchObject({ status: 'saved' });
    held.release();
    await retry;

    // The conversion that read the trip in USD is stale: the screen loads again (as useTripBudget does on idle).
    expect(selectBudgetLoadStatus(store.getState(), 'trip-1')).toBe('idle');
    await loadAndConvertTripBudget(store, 'trip-1');

    expect(selectBudgetSummary(store.getState(), 'trip-1')).toMatchObject({
      currency: 'EUR',
      totalSpent: 4211 + 2000,
      unconvertedCount: 0,
    });
  });

  it('does not accept a conversion retry that started before the currency changed', async () => {
    const { store, dependencies } = await setup();
    await loadAndConvertTripBudget(store, 'trip-1');
    const held = holdNextLoad(dependencies.getTripBudget);

    const retry = store.dispatch(retryConversions('trip-1'));
    await held.read;
    await changeCurrencyToEuro(store);
    held.release();
    await retry;

    expect(selectBudgetLoadStatus(store.getState(), 'trip-1')).toBe('idle');
    await loadAndConvertTripBudget(store, 'trip-1');
    expect(selectBudgetSummary(store.getState(), 'trip-1')).toMatchObject({ currency: 'EUR', unconvertedCount: 0 });
  });

  it('keeps an expense saved while a conversion retry is running in the list and totals', async () => {
    const { store, dependencies } = await setup();
    await loadAndConvertTripBudget(store, 'trip-1');
    const held = holdNextLoad(dependencies.getTripBudget);

    const retry = store.dispatch(retryConversions('trip-1'));
    await held.read;
    const created = await store.dispatch(
      createExpense({ tripId: 'trip-1', input: expenseInput({ title: 'Museum', amount: '12' }) }),
    );
    expect(created.payload).toMatchObject({ status: 'saved' });
    held.release();
    await retry;

    expect(ids(store)).toHaveLength(3);
    expect(selectBudgetSummary(store.getState(), 'trip-1')).toMatchObject({ totalSpent: 4550 + 2161 + 1200 });
    // What is shown stays on screen while the totals are converted again.
    expect(selectBudgetLoadStatus(store.getState(), 'trip-1')).toBe('ready');
  });

  it('does not bring back an expense deleted while a conversion retry is running', async () => {
    const { store, dependencies } = await setup();
    await loadAndConvertTripBudget(store, 'trip-1');
    const held = holdNextLoad(dependencies.getTripBudget);

    const retry = store.dispatch(retryConversions('trip-1'));
    await held.read;
    const deleted = await store.dispatch(deleteExpense('dinner'));
    expect(deleted.payload).toMatchObject({ status: 'deleted' });
    held.release();
    await retry;

    expect(selectExpenseById(store.getState(), 'dinner')).toBeUndefined();
    expect(ids(store)).toEqual(['tram']);
  });

  it('asks for the totals to be converted again after a change lands during an in-flight retry', async () => {
    const { store, dependencies } = await setup();
    await loadAndConvertTripBudget(store, 'trip-1');
    const held = holdNextLoad(dependencies.getTripBudget);

    const retry = store.dispatch(retryConversions('trip-1'));
    await held.read;
    await store.dispatch(deleteExpense('dinner'));
    // Cleared at once, so useTripBudget starts a new conversion while the stale one finishes.
    expect(selectBudgetRunning(store.getState(), 'trip-1')).toBe(false);
    held.release();
    await retry;

    expect(selectBudgetConverted(store.getState(), 'trip-1')).toBe(false);
    expect(selectBudgetRunning(store.getState(), 'trip-1')).toBe(false);
    await store.dispatch(retryConversions('trip-1'));
    expect(selectBudgetConverted(store.getState(), 'trip-1')).toBe(true);
    expect(ids(store)).toEqual(['tram']);
  });

  it('keeps an expense created while the listing load is still running', async () => {
    const { store, dependencies, expenseRepository } = await setup();
    const held = holdNextLoad(dependencies.getTripExpenses);

    const load = store.dispatch(loadTripExpenses('trip-1'));
    await held.read;
    await store.dispatch(createExpense({ tripId: 'trip-1', input: expenseInput({ title: 'Museum', amount: '12' }) }));
    held.release();
    await load;

    // The stale listing is dropped and read again from SQLite, which has all three.
    expect(selectBudgetLoadStatus(store.getState(), 'trip-1')).toBe('idle');
    await store.dispatch(loadTripExpenses('trip-1'));
    expect(ids(store)).toHaveLength(3);
    const stored = await expenseRepository.listByTrip(TRIP_OWNER, 'trip-1');
    expect(stored.ok && stored.value).toHaveLength(3);
  });
});
