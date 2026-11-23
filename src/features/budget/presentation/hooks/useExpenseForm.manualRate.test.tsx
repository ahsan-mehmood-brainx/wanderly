import { act, renderHook } from '@testing-library/react-native';
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

import { useExpenseForm } from './useExpenseForm';

/** 20.00 EUR converted by hand at 1 EUR = 1.1 USD while no rate was available. */
const manual = euroExpense({
  id: 'manual',
  baseAmount: 2200,
  exchangeRate: { rate: '1.1', rateDate: EXPENSE_DAY, source: 'manual' },
});

async function renderOfflineForm() {
  const storage = await seededBudgetDatabase([BUDGET_TRIP], [manual]);
  const factory = new FakeHttpClientFactory();
  stubFrankfurter(factory, {}).otherwise(() => apiFailure(new ApiError('offline', 'No connection')));
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
  const rendered = await renderHook(() => useExpenseForm(BUDGET_TRIP, manual, BUDGET_TODAY), { wrapper });
  return { ...rendered, storage };
}

describe('useExpenseForm stored manual rate', () => {
  it('keeps the stored manual rate when saved before the rate lookup finishes', async () => {
    const { result, storage } = await renderOfflineForm();

    await act(async () => {
      result.current.setAmount('30');
    });
    expect(result.current.preview.status).toBe('loading');
    await act(async () => {
      await result.current.submit();
    });

    const stored = await storage.expenseRepository.findById(TRIP_OWNER, 'manual');
    // 30.00 EUR at the stored 1.1, not dropped from the totals as unconverted.
    expect(stored.ok && stored.value).toMatchObject({
      amount: 3000,
      baseAmount: 3300,
      exchangeRate: { rate: '1.1', source: 'manual' },
    });
  });
});
