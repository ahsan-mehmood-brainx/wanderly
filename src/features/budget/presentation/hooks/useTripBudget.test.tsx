import { act, renderHook, waitFor } from '@testing-library/react-native';
import { type ReactNode } from 'react';
import { Provider as ReduxProvider } from 'react-redux';

import { DependenciesProvider } from '@/core/di/DependenciesProvider';
import { type AppError } from '@/core/errors/AppError';
import { type Result } from '@/core/result';
import { loadTrips } from '@/features/trips/presentation/state/tripsSlice';
import {
  BUDGET_TRIP,
  expense,
  expenseInput,
  seededBudgetDatabase,
  stubFrankfurter,
  unconvertedExpense,
} from '@/testing/budgetFixtures';
import { createTestStore } from '@/testing/createTestStore';
import { FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { ManualClock } from '@/testing/ManualClock';
import { createTestDependencies } from '@/testing/testDependencies';
import { FakeTripOwnerProvider, TRIPS_NOW } from '@/testing/tripFixtures';

import { type TripBudget } from '../../domain/usecases/expenseUseCases';
import { createExpense } from '../state/budgetSlice';
import { useTripBudget } from './useTripBudget';

async function setup() {
  const storage = await seededBudgetDatabase(
    [BUDGET_TRIP],
    [expense({ id: 'dinner', date: '2027-06-11', createdAt: 1 }), unconvertedExpense({ createdAt: 2 })],
  );
  const factory = new FakeHttpClientFactory();
  stubFrankfurter(factory, { 'EUR>USD': 1.0805, 'JPY>USD': 0.0061 });
  const dependencies = createTestDependencies({
    database: storage.database,
    tripOwnerProvider: new FakeTripOwnerProvider(),
    clock: new ManualClock(TRIPS_NOW),
    httpClientFactory: factory,
  });
  const store = createTestStore(dependencies);
  await store.dispatch(loadTrips());
  const wrapper = ({ children }: { children: ReactNode }) => (
    <DependenciesProvider dependencies={dependencies}>
      <ReduxProvider store={store}>{children}</ReduxProvider>
    </DependenciesProvider>
  );
  return { dependencies, store, wrapper };
}

/** Holds the next run's result (after it has read and written SQLite) until `release`. */
function holdNextRun(useCase: { execute: (tripId: string) => Promise<Result<TripBudget, AppError>> }) {
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

describe('useTripBudget', () => {
  it('converts again when an expense is saved while the first background conversion is running', async () => {
    const { dependencies, store, wrapper } = await setup();
    const held = holdNextRun(dependencies.getTripBudget);
    const getTripBudget = jest.spyOn(dependencies.getTripBudget, 'execute');

    const { result } = await renderHook(() => useTripBudget('trip-1'), { wrapper });
    await act(async () => {
      await held.read;
    });
    expect(result.current.summary).toMatchObject({ unconvertedCount: 1 });
    expect(result.current.converting).toBe(true);

    await act(async () => {
      await store.dispatch(createExpense({ tripId: 'trip-1', input: expenseInput({ title: 'Museum', amount: '12' }) }));
    });
    await act(async () => {
      held.release();
    });

    // The stale run's result is refused and a new conversion picks up what SQLite now holds.
    await waitFor(() => expect(result.current.summary).toMatchObject({ unconvertedCount: 0 }));
    expect(result.current.converting).toBe(false);
    expect(result.current.expenses).toHaveLength(3);
    expect(getTripBudget).toHaveBeenCalledTimes(2);
  });

  it('shares one conversion between screens showing the same trip', async () => {
    const { dependencies, wrapper } = await setup();
    const getTripBudget = jest.spyOn(dependencies.getTripBudget, 'execute');

    const card = await renderHook(() => useTripBudget('trip-1'), { wrapper });
    const overview = await renderHook(() => useTripBudget('trip-1'), { wrapper });

    await waitFor(() => expect(overview.result.current.summary).toMatchObject({ unconvertedCount: 0 }));
    expect(card.result.current.summary).toMatchObject({ unconvertedCount: 0 });
    expect(getTripBudget).toHaveBeenCalledTimes(1);
  });
});
