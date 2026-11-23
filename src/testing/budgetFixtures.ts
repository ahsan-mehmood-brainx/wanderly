import { ApiError } from '@/core/http/ApiError';
import { type AppStore } from '@/core/store/store';
import { LocalExchangeRateCache } from '@/features/budget/data/LocalExchangeRateCache';
import { LocalExpenseRepository } from '@/features/budget/data/LocalExpenseRepository';
import { type Expense, type ExpenseInput } from '@/features/budget/domain/Expense';
import { loadTripExpenses, retryConversions } from '@/features/budget/presentation/state/budgetSlice';
import { type StoredTrip } from '@/features/trips/domain/Trip';

import { apiFailure, apiSuccess, type FakeHttpClient, type FakeHttpClientFactory } from './FakeHttpClient';
import { createTripStorage, storedTrip, TRIP_OWNER, TRIPS_NOW } from './tripFixtures';

/** What a totals screen does through `useTripBudget`: read the stored expenses, then convert them. */
export async function loadAndConvertTripBudget(store: AppStore, tripId: string): Promise<void> {
  await store.dispatch(loadTripExpenses(tripId));
  await store.dispatch(retryConversions(tripId));
}

/** Today in budget tests is 15 June 2027 (`TRIPS_NOW`). */
export const BUDGET_TODAY = '2027-06-15';

/**
 * Ran 10–14 June 2027, so every trip day is in the past (historical rates). Budget
 * $1,000.00 in USD.
 */
export const BUDGET_TRIP = storedTrip({
  id: 'trip-1',
  title: 'Lisbon getaway',
  startDate: '2027-06-10',
  endDate: '2027-06-14',
  budget: 100_000,
  currency: 'USD',
});

export const EXPENSE_DAY = '2027-06-12';

export function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'exp-1',
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
    ...overrides,
  };
}

/** A 20.00 EUR expense converted at 1 EUR = 1.0805 USD. */
export function euroExpense(overrides: Partial<Expense> = {}): Expense {
  return expense({
    id: 'exp-eur',
    title: 'Tram tickets',
    amount: 2000,
    currency: 'EUR',
    baseAmount: 2161,
    exchangeRate: { rate: '1.0805', rateDate: EXPENSE_DAY, source: 'api' },
    category: 'transport',
    ...overrides,
  });
}

/** An expense saved while no rate was available. */
export function unconvertedExpense(overrides: Partial<Expense> = {}): Expense {
  return expense({
    id: 'exp-jpy',
    title: 'Ramen',
    amount: 1500,
    currency: 'JPY',
    baseAmount: null,
    exchangeRate: null,
    ...overrides,
  });
}

export function expenseInput(overrides: Partial<ExpenseInput> = {}): ExpenseInput {
  return {
    title: 'Dinner',
    amount: '45.50',
    currency: 'USD',
    category: 'food',
    date: EXPENSE_DAY,
    paymentMethod: 'card',
    notes: '',
    manualRate: '',
    ...overrides,
  };
}

/** Real in-memory SQLite with the trip, expense and exchange-rate stores on it. */
export function createBudgetStorage() {
  const storage = createTripStorage();
  return {
    ...storage,
    tripRepository: storage.repository,
    expenseRepository: new LocalExpenseRepository(storage.database, storage.logger),
    rateCache: new LocalExchangeRateCache(storage.database, storage.logger),
  };
}

/** Storage holding `trips` and then `expenses` (inserted in order), all belonging to `ownerId`. */
export async function seededBudgetDatabase(
  trips: readonly StoredTrip[] = [BUDGET_TRIP],
  expenses: readonly Expense[] = [],
  ownerId = TRIP_OWNER,
) {
  const storage = createBudgetStorage();
  for (const trip of trips) {
    const saved = await storage.tripRepository.insert(ownerId, trip);
    if (!saved.ok) throw saved.error;
  }
  for (const item of expenses) {
    const saved = await storage.expenseRepository.insert(ownerId, item);
    if (!saved.ok) throw saved.error;
  }
  return storage;
}

/** Frankfurter's wire format for `/latest` and `/{date}`. */
export function ratesDto(base: string, date: string, rates: Record<string, number>) {
  return { amount: 1, base, date, rates };
}

/** Frankfurter's wire format for `/currencies`. */
export const CURRENCIES_DTO = {
  AUD: 'Australian Dollar',
  EUR: 'Euro',
  GBP: 'British Pound',
  JPY: 'Japanese Yen',
  USD: 'United States Dollar',
};

/**
 * The Frankfurter client of `factory`. With `rates`, answers `/{date}` and `/latest`
 * for each `FROM>TO` pair (e.g. `{ 'EUR>USD': 1.0805 }`) with the requested date as
 * the rate date, and `/currencies` with {@link CURRENCIES_DTO}; anything else is a 404 `notFound`
 * (Frankfurter's answer for a date or pair it has no rate for).
 */
export function stubFrankfurter(
  factory: FakeHttpClientFactory,
  rates: Readonly<Record<string, number>> = {},
  latestDate = BUDGET_TODAY,
): FakeHttpClient {
  const client = factory.client('frankfurter');
  client.on('GET', '/currencies', apiSuccess(CURRENCIES_DTO));
  client.otherwise((request) => {
    const base = String(request.query?.base ?? '');
    const symbols = String(request.query?.symbols ?? '');
    const rate = rates[`${base}>${symbols}`];
    const date = request.path === '/latest' ? latestDate : request.path.slice(1);
    if (rate === undefined || !/^\/(latest|\d{4}-\d{2}-\d{2})$/.test(request.path)) {
      return apiFailure(new ApiError('notFound', 'Request failed (notFound)', { status: 404 }));
    }
    return apiSuccess(ratesDto(base, date, { [symbols]: rate }));
  });
  return client;
}
