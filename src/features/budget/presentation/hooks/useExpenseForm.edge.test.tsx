import { act, renderHook, waitFor } from '@testing-library/react-native';
import { type ReactNode } from 'react';
import { Provider as ReduxProvider } from 'react-redux';

import { DependenciesProvider } from '@/core/di/DependenciesProvider';
import { ApiError } from '@/core/http/ApiError';
import {
  BUDGET_TODAY,
  BUDGET_TRIP,
  EXPENSE_DAY,
  euroExpense,
  loadAndConvertTripBudget,
  seededBudgetDatabase,
  stubFrankfurter,
} from '@/testing/budgetFixtures';
import { createTestStore } from '@/testing/createTestStore';
import { apiFailure, FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { ManualClock } from '@/testing/ManualClock';
import { createTestDependencies } from '@/testing/testDependencies';
import { FakeTripOwnerProvider, TRIP_OWNER, TRIPS_NOW } from '@/testing/tripFixtures';

import { type Expense } from '../../domain/Expense';
import { useExpenseForm } from './useExpenseForm';

/** 20.00 EUR converted by hand at 1 EUR = 1.1 USD while no rate was available. */
const manual = euroExpense({
  id: 'manual',
  baseAmount: 2200,
  exchangeRate: { rate: '1.1', rateDate: EXPENSE_DAY, source: 'manual' },
});

async function renderForm(editing: Expense | null, { offline = false } = {}) {
  const storage = await seededBudgetDatabase([BUDGET_TRIP], editing ? [editing] : []);
  const factory = new FakeHttpClientFactory();
  const http = stubFrankfurter(factory, { 'EUR>USD': 1.0805 });
  if (offline) http.otherwise(() => apiFailure(new ApiError('offline', 'No connection')));
  const dependencies = createTestDependencies({
    database: storage.database,
    tripOwnerProvider: new FakeTripOwnerProvider(),
    clock: new ManualClock(TRIPS_NOW),
    httpClientFactory: factory,
  });
  const store = createTestStore(dependencies);
  await loadAndConvertTripBudget(store, 'trip-1');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <DependenciesProvider dependencies={dependencies}>
      <ReduxProvider store={store}>{children}</ReduxProvider>
    </DependenciesProvider>
  );
  const rendered = await renderHook(() => useExpenseForm(BUDGET_TRIP, editing, BUDGET_TODAY), { wrapper });
  return { ...rendered, storage, dependencies };
}

type Form = Awaited<ReturnType<typeof renderForm>>['result'];

async function submit(result: Form) {
  await act(async () => {
    await result.current.submit();
  });
}

describe('useExpenseForm edge cases', () => {
  it('offline, keeps the typed rate of a manually converted expense and applies it to a new amount', async () => {
    const { result, storage } = await renderForm(manual, { offline: true });
    expect(result.current.input.manualRate).toBe('1.1');
    await waitFor(() => expect(result.current.preview.status).toBe('unavailable'));

    await act(async () => {
      result.current.setAmount('30');
    });
    await submit(result);

    expect(result.current.savedExpense).toMatchObject({
      amount: 3000,
      baseAmount: 3300,
      exchangeRate: { rate: '1.1', source: 'manual' },
    });
    const stored = await storage.expenseRepository.findById(TRIP_OWNER, 'manual');
    expect(stored.ok && stored.value?.baseAmount).toBe(3300);
  });

  it('online, converts a changed manual expense at the published rate instead of the old typed one', async () => {
    const { result } = await renderForm(manual);
    await waitFor(() => expect(result.current.preview.status).toBe('ready'));

    await act(async () => {
      result.current.setAmount('30');
    });
    await submit(result);

    expect(result.current.savedExpense).toMatchObject({
      baseAmount: 3242,
      exchangeRate: { rate: '1.0805', source: 'api' },
    });
  });

  it('saves once when submit is tapped twice while the first save is running', async () => {
    const { result, dependencies } = await renderForm(null);
    const create = jest.spyOn(dependencies.createExpense, 'execute');
    await act(async () => {
      result.current.setTitle('Taxi');
      result.current.setAmount('12');
    });

    await act(async () => {
      await Promise.all([result.current.submit(), result.current.submit()]);
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(result.current.savedExpense).toMatchObject({ title: 'Taxi', amount: 1200 });
    expect(result.current.failure).toBeNull();
  });

  it('defaults a new expense to the trip currency and the first trip day when today is after the trip', async () => {
    const { result } = await renderForm(null);
    expect(result.current.input).toMatchObject({ currency: 'USD', date: BUDGET_TRIP.startDate, manualRate: '' });
    expect(result.current.preview.status).toBe('none');
  });

  it('does not count a still-loading preview as unavailable, so a typed rate is not sent', async () => {
    const { result } = await renderForm(null);
    await act(async () => {
      result.current.setTitle('Tram');
      result.current.setAmount('20');
      result.current.setCurrency('EUR');
      result.current.setManualRate('2');
    });
    expect(result.current.preview.status).toBe('loading');

    await submit(result);

    expect(result.current.savedExpense).toMatchObject({ baseAmount: 2161, exchangeRate: { source: 'api' } });
  });
});
