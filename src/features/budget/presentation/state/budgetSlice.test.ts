import { AppError } from '@/core/errors/AppError';
import { ApiError } from '@/core/http/ApiError';
import { err } from '@/core/result';
import { type AuthUser } from '@/features/auth/domain/AuthUser';
import { sessionExpired, signIn, signOut } from '@/features/auth/presentation/state/authSlice';
import { type StoredTrip } from '@/features/trips/domain/Trip';
import { deleteTrip, loadTrips, updateTrip } from '@/features/trips/presentation/state/tripsSlice';
import {
  BUDGET_TODAY,
  BUDGET_TRIP,
  euroExpense,
  expense,
  expenseInput,
  loadAndConvertTripBudget,
  seededBudgetDatabase,
  stubFrankfurter,
  unconvertedExpense,
} from '@/testing/budgetFixtures';
import { createTestStore } from '@/testing/createTestStore';
import { apiFailure, FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { ManualClock } from '@/testing/ManualClock';
import { createTestDependencies } from '@/testing/testDependencies';
import { FakeTripOwnerProvider, storedTrip, TRIP_OWNER, TRIPS_NOW, tripInput } from '@/testing/tripFixtures';

import { type Expense } from '../../domain/Expense';
import {
  createExpense,
  deleteExpense,
  loadTripExpenses,
  retryConversions,
  selectBudgetTrip,
  updateExpense,
} from './budgetSlice';
import {
  selectBudgetConverted,
  selectBudgetLoadStatus,
  selectBudgetRunning,
  selectBudgetSaving,
  selectBudgetSummary,
  selectBudgetTripId,
  selectDefaultBudgetTripId,
  selectExpenseById,
  selectTripExpenses,
} from './selectors';

const RATES = { 'EUR>USD': 1.0805, 'JPY>USD': 0.0061, 'USD>EUR': 0.9255, 'JPY>EUR': 0.0057 };
const otherTrip = storedTrip({ id: 'trip-2', startDate: '2027-08-01', endDate: '2027-08-03' });
const dinner = expense({ id: 'dinner', date: '2027-06-11', createdAt: 1 });
const tram = euroExpense({ id: 'tram', date: '2027-06-13', createdAt: 2 });
const elsewhere = expense({ id: 'elsewhere', tripId: 'trip-2', date: '2027-08-01' });

async function setup(
  expenses: readonly Expense[] = [dinner, tram],
  trips: readonly StoredTrip[] = [BUDGET_TRIP, otherTrip],
) {
  const storage = await seededBudgetDatabase(trips, expenses);
  const factory = new FakeHttpClientFactory();
  const http = stubFrankfurter(factory, RATES);
  const owners = new FakeTripOwnerProvider();
  const dependencies = createTestDependencies({
    database: storage.database,
    tripOwnerProvider: owners,
    clock: new ManualClock(TRIPS_NOW),
    httpClientFactory: factory,
  });
  const store = createTestStore(dependencies);
  await store.dispatch(loadTrips());
  return { ...storage, dependencies, owners, store, factory, http };
}

type Store = Awaited<ReturnType<typeof setup>>['store'];

const expenseIds = (store: Store, tripId = 'trip-1') =>
  selectTripExpenses(store.getState(), tripId).map(({ id }) => id);

const user: AuthUser = { id: 2, username: 'b', email: 'b@example.com', firstName: 'B', lastName: 'C', imageUrl: null };
const credentials = { username: 'b', password: 'secret' };

describe('budget state', () => {
  it("loads a trip's expenses once, newest first", async () => {
    const { store, dependencies } = await setup();
    const getTripExpenses = jest.spyOn(dependencies.getTripExpenses, 'execute');

    await store.dispatch(loadTripExpenses('trip-1'));
    await store.dispatch(loadTripExpenses('trip-1'));

    expect(selectBudgetLoadStatus(store.getState(), 'trip-1')).toBe('ready');
    expect(expenseIds(store)).toEqual(['tram', 'dinner']);
    expect(getTripExpenses).toHaveBeenCalledTimes(1);
  });

  it('runs one conversion at a time however many screens ask for it', async () => {
    const { store, dependencies } = await setup();
    await store.dispatch(loadTripExpenses('trip-1'));
    const getTripBudget = jest.spyOn(dependencies.getTripBudget, 'execute');

    const first = store.dispatch(retryConversions('trip-1'));
    const second = store.dispatch(retryConversions('trip-1'));
    expect(selectBudgetRunning(store.getState(), 'trip-1')).toBe(true);
    await Promise.all([first, second]);

    expect(getTripBudget).toHaveBeenCalledTimes(1);
    expect(selectBudgetRunning(store.getState(), 'trip-1')).toBe(false);
    expect(selectBudgetConverted(store.getState(), 'trip-1')).toBe(true);
  });

  it('keeps each trip separate', async () => {
    const { store } = await setup([dinner, elsewhere]);

    await loadAndConvertTripBudget(store, 'trip-1');

    expect(expenseIds(store)).toEqual(['dinner']);
    expect(selectBudgetLoadStatus(store.getState(), 'trip-2')).toBe('idle');
  });

  it('records a failed load and can retry', async () => {
    const { store, dependencies } = await setup();
    jest.spyOn(dependencies.getTripExpenses, 'execute').mockResolvedValueOnce(err(new AppError('storage', 'x')));

    await store.dispatch(loadTripExpenses('trip-1'));
    expect(selectBudgetLoadStatus(store.getState(), 'trip-1')).toBe('failed');
    expect(store.getState().budget.loadByTrip['trip-1']).toMatchObject({ errorKind: 'storage' });

    await store.dispatch(loadTripExpenses('trip-1'));
    expect(selectBudgetLoadStatus(store.getState(), 'trip-1')).toBe('ready');
  });

  it('summarises the trip against its budget and currency', async () => {
    const { store } = await setup([dinner, tram, unconvertedExpense({ createdAt: 3 })]);
    expect(selectBudgetSummary(store.getState(), 'trip-1')).toMatchObject({ totalSpent: 0 });

    await loadAndConvertTripBudget(store, 'trip-1');

    expect(selectBudgetSummary(store.getState(), 'trip-1')).toMatchObject({
      currency: 'USD',
      totalBudget: 100_000,
      totalSpent: 4550 + 2161 + 915,
      remaining: 100_000 - 7626,
      unconvertedCount: 0,
    });
  });

  it('has no summary for a trip it does not know', async () => {
    const { store } = await setup();
    expect(selectBudgetSummary(store.getState(), 'gone')).toBeNull();
  });

  it('mirrors a created expense after it is saved, updates the totals and stays serialisable', async () => {
    const { store } = await setup();
    await loadAndConvertTripBudget(store, 'trip-1');

    const action = await store.dispatch(
      createExpense({
        tripId: 'trip-1',
        input: expenseInput({ title: 'Museum', amount: '12', category: 'activities' }),
      }),
    );

    expect(action.payload).toMatchObject({ status: 'saved', expense: { title: 'Museum', baseAmount: 1200 } });
    expect(selectTripExpenses(store.getState(), 'trip-1')).toHaveLength(3);
    expect(selectBudgetSummary(store.getState(), 'trip-1')?.totalSpent).toBe(4550 + 2161 + 1200);
    expect(JSON.parse(JSON.stringify(store.getState().budget))).toEqual(store.getState().budget);
  });

  it('adds nothing when the input is invalid', async () => {
    const { store } = await setup();
    await loadAndConvertTripBudget(store, 'trip-1');

    const action = await store.dispatch(createExpense({ tripId: 'trip-1', input: expenseInput({ title: '' }) }));

    expect(action.payload).toEqual({ status: 'invalid', errors: { fields: { title: 'required' } } });
    expect(expenseIds(store)).toEqual(['tram', 'dinner']);
    expect(selectBudgetSaving(store.getState())).toBe(false);
  });

  it('applies updates and deletions, with the totals following', async () => {
    const { store } = await setup();
    await loadAndConvertTripBudget(store, 'trip-1');

    await store.dispatch(updateExpense({ id: 'dinner', input: expenseInput({ title: 'Lunch', amount: '10' }) }));
    expect(selectExpenseById(store.getState(), 'dinner')).toMatchObject({ title: 'Lunch', baseAmount: 1000 });
    expect(selectBudgetSummary(store.getState(), 'trip-1')?.totalSpent).toBe(1000 + 2161);

    const deleted = await store.dispatch(deleteExpense('dinner'));
    expect(deleted.payload).toEqual({ status: 'deleted', id: 'dinner' });
    expect(selectExpenseById(store.getState(), 'dinner')).toBeUndefined();
    expect(selectBudgetSummary(store.getState(), 'trip-1')?.totalSpent).toBe(2161);
  });

  it('turns a failure into its kind and keeps the expense', async () => {
    const { store, dependencies } = await setup();
    await loadAndConvertTripBudget(store, 'trip-1');
    jest.spyOn(dependencies.expenseRepository, 'delete').mockResolvedValueOnce(err(new AppError('storage', 'x')));

    const action = await store.dispatch(deleteExpense('dinner'));

    expect(action.payload).toEqual({ status: 'failed', errorKind: 'storage' });
    expect(selectExpenseById(store.getState(), 'dinner')).toBeDefined();
  });

  it('runs one change at a time, so a double tap saves one expense', async () => {
    const { store, expenseRepository } = await setup([]);
    const [first, second] = await Promise.all([
      store.dispatch(createExpense({ tripId: 'trip-1', input: expenseInput() })),
      store.dispatch(createExpense({ tripId: 'trip-1', input: expenseInput() })),
    ]);

    expect(createExpense.fulfilled.match(first)).toBe(true);
    expect(createExpense.rejected.match(second) && second.meta.condition).toBe(true);
    const saved = await expenseRepository.listByTrip(TRIP_OWNER, 'trip-1');
    expect(saved.ok && saved.value).toHaveLength(1);
    expect(selectBudgetSaving(store.getState())).toBe(false);
  });

  it('releases the save lock after an unexpected throw', async () => {
    const { store, dependencies } = await setup([]);
    jest.spyOn(dependencies.createExpense, 'execute').mockRejectedValueOnce(new Error('bug'));
    await store.dispatch(createExpense({ tripId: 'trip-1', input: expenseInput() }));
    expect(selectBudgetSaving(store.getState())).toBe(false);
  });

  it('converts expenses saved offline when the conversions are retried online', async () => {
    const { store, http, factory } = await setup([dinner, unconvertedExpense({ createdAt: 3 })]);
    http.otherwise(() => apiFailure(new ApiError('offline', 'No connection')));
    await loadAndConvertTripBudget(store, 'trip-1');
    expect(selectBudgetSummary(store.getState(), 'trip-1')).toMatchObject({ totalSpent: 4550, unconvertedCount: 1 });

    stubFrankfurter(factory, RATES);
    await store.dispatch(retryConversions('trip-1'));

    expect(selectBudgetSummary(store.getState(), 'trip-1')).toMatchObject({
      totalSpent: 4550 + 915,
      unconvertedCount: 0,
    });
  });

  it('reloads and reconverts a trip after its currency changes', async () => {
    const { store, expenseRepository } = await setup();
    await loadAndConvertTripBudget(store, 'trip-1');

    const changed = await store.dispatch(
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
    expect(changed.payload).toMatchObject({ status: 'saved' });
    expect(selectBudgetLoadStatus(store.getState(), 'trip-1')).toBe('idle');

    await loadAndConvertTripBudget(store, 'trip-1');

    expect(selectExpenseById(store.getState(), 'dinner')).toMatchObject({ baseCurrency: 'EUR', baseAmount: 4211 });
    expect(selectExpenseById(store.getState(), 'tram')).toMatchObject({ baseCurrency: 'EUR', baseAmount: 2000 });
    expect(selectBudgetSummary(store.getState(), 'trip-1')).toMatchObject({
      currency: 'EUR',
      totalBudget: 90_000,
      totalSpent: 6211,
    });
    const persisted = await expenseRepository.findById(TRIP_OWNER, 'dinner');
    expect(persisted.ok && persisted.value?.baseCurrency).toBe('EUR');
  });

  it("drops a deleted trip's expenses and keeps other trips'", async () => {
    const { store } = await setup([dinner, tram, elsewhere]);
    await loadAndConvertTripBudget(store, 'trip-1');
    await loadAndConvertTripBudget(store, 'trip-2');

    await store.dispatch(deleteTrip('trip-1'));

    expect(selectTripExpenses(store.getState(), 'trip-1')).toEqual([]);
    expect(selectBudgetLoadStatus(store.getState(), 'trip-1')).toBe('idle');
    expect(expenseIds(store, 'trip-2')).toEqual(['elsewhere']);
  });

  describe('which trip the Budget tab shows', () => {
    const at = (id: string, startDate: string, endDate: string, cancelledAt: number | null = null) =>
      storedTrip({ id, startDate, endDate, cancelledAt });

    it.each<[string, StoredTrip[], string | null]>([
      [
        'the ongoing trip',
        [
          at('past', '2027-06-01', '2027-06-05'),
          at('soon', '2027-07-01', '2027-07-03'),
          at('now', '2027-06-13', '2027-06-18'),
        ],
        'now',
      ],
      [
        'the next upcoming trip when none is ongoing',
        [
          at('later', '2027-09-01', '2027-09-03'),
          at('past', '2027-06-01', '2027-06-05'),
          at('soon', '2027-07-01', '2027-07-03'),
        ],
        'soon',
      ],
      [
        'the most recently ended trip, before a cancelled one',
        [
          at('old', '2027-01-01', '2027-01-03'),
          at('recent', '2027-06-01', '2027-06-05'),
          at('off', '2027-06-14', '2027-06-16', TRIPS_NOW),
        ],
        'recent',
      ],
      ['a cancelled trip when that is all there is', [at('off', '2027-06-14', '2027-06-16', TRIPS_NOW)], 'off'],
      ['nothing without trips', [], null],
    ])('defaults to %s', async (_name, trips, expected) => {
      const { store } = await setup([], trips);
      expect(selectDefaultBudgetTripId(store.getState(), BUDGET_TODAY)).toBe(expected);
      expect(selectBudgetTripId(store.getState(), BUDGET_TODAY)).toBe(expected);
    });

    it('shows the trip picked in the switcher until it is deleted', async () => {
      const { store } = await setup([], [BUDGET_TRIP, otherTrip]);
      expect(selectBudgetTripId(store.getState(), BUDGET_TODAY)).toBe('trip-2');

      store.dispatch(selectBudgetTrip('trip-1'));
      expect(selectBudgetTripId(store.getState(), BUDGET_TODAY)).toBe('trip-1');

      await store.dispatch(deleteTrip('trip-1'));
      expect(selectBudgetTripId(store.getState(), BUDGET_TODAY)).toBe('trip-2');
    });
  });

  describe('when the account changes', () => {
    it.each([
      ['sign-out', signOut.fulfilled(undefined, 'r')],
      ['a failed sign-out', signOut.rejected(new Error('x'), 'r')],
      ['session expiry', sessionExpired()],
      ['a new sign-in', signIn.fulfilled(user, 'r', credentials)],
    ])('forgets the expenses and the picked trip on %s', async (_name, action) => {
      const { store } = await setup();
      await loadAndConvertTripBudget(store, 'trip-1');
      store.dispatch(selectBudgetTrip('trip-1'));

      store.dispatch(action);

      expect(selectTripExpenses(store.getState(), 'trip-1')).toEqual([]);
      expect(selectBudgetLoadStatus(store.getState(), 'trip-1')).toBe('idle');
      expect(store.getState().budget.selectedTripId).toBeNull();
    });

    it('stays idle while signed out, so the next sign-in loads', async () => {
      const { store, owners, dependencies } = await setup();
      const getTripBudget = jest.spyOn(dependencies.getTripBudget, 'execute');
      owners.ownerId = null;

      await loadAndConvertTripBudget(store, 'trip-1');

      expect(getTripBudget).not.toHaveBeenCalled();
      expect(selectBudgetLoadStatus(store.getState(), 'trip-1')).toBe('idle');
    });

    it('ignores a load that finishes after sign-out', async () => {
      const { store } = await setup();
      const loading = store.dispatch(loadTripExpenses('trip-1'));

      store.dispatch(signOut.fulfilled(undefined, 'r'));
      await loading;

      expect(selectTripExpenses(store.getState(), 'trip-1')).toEqual([]);
      expect(selectBudgetLoadStatus(store.getState(), 'trip-1')).toBe('idle');
    });

    it('ignores a change that finishes after sign-out, and allows new ones', async () => {
      const { store } = await setup([]);
      const saving = store.dispatch(createExpense({ tripId: 'trip-1', input: expenseInput() }));

      store.dispatch(signOut.fulfilled(undefined, 'r'));
      expect(selectBudgetSaving(store.getState())).toBe(false);
      await saving;

      expect(selectTripExpenses(store.getState(), 'trip-1')).toEqual([]);
      expect(selectBudgetSaving(store.getState())).toBe(false);
    });
  });
});
