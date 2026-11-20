import { fireEvent, userEvent } from '@testing-library/react-native';
import { type Href, router, Stack } from 'expo-router';
import { act, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';

import BreakdownRoute from '@/app/(app)/(tabs)/budget/[tripId]/breakdown';
import ExpenseRoute from '@/app/(app)/(tabs)/budget/[tripId]/expenses/[expenseId]/index';
import EditExpenseRoute from '@/app/(app)/(tabs)/budget/[tripId]/expenses/[expenseId]/edit';
import ExpenseHistoryRoute from '@/app/(app)/(tabs)/budget/[tripId]/expenses/index';
import NewExpenseRoute from '@/app/(app)/(tabs)/budget/[tripId]/expenses/new';
import TripBudgetRoute from '@/app/(app)/(tabs)/budget/[tripId]/index';
import BudgetRoute from '@/app/(app)/(tabs)/budget/index';
import TripRoute from '@/app/(app)/(tabs)/trips/[tripId]/index';
import NewTripRoute from '@/app/(app)/(tabs)/trips/new';
import { AppProviders } from '@/bootstrap/AppProviders';
import { type AppDependencies } from '@/core/di/AppDependencies';
import { AppError } from '@/core/errors/AppError';
import { ApiError } from '@/core/http/ApiError';
import { createI18n } from '@/core/i18n/createI18n';
import { err } from '@/core/result';
import { type Expense } from '@/features/budget/domain/Expense';
import { type StoredTrip } from '@/features/trips/domain/Trip';
import {
  BUDGET_TRIP,
  euroExpense,
  expense,
  seededBudgetDatabase,
  stubFrankfurter,
  unconvertedExpense,
} from '@/testing/budgetFixtures';
import { createTestStore } from '@/testing/createTestStore';
import { apiFailure, FakeHttpClientFactory } from '@/testing/FakeHttpClient';
import { ManualClock } from '@/testing/ManualClock';
import { createTestDependencies } from '@/testing/testDependencies';
import { OTHER_TRIP_OWNER, storedTrip, TRIP_OWNER, TRIPS_NOW } from '@/testing/tripFixtures';

const RATES = { 'EUR>USD': 1.0805, 'JPY>USD': 0.0061 };

const dinner = expense({ id: 'dinner', title: 'Dinner', date: '2027-06-11', createdAt: 1 });
const tram = euroExpense({ id: 'tram', title: 'Tram tickets', date: '2027-06-13', createdAt: 2 });

interface LaunchOptions {
  readonly trips?: readonly StoredTrip[];
  readonly overrides?: Partial<AppDependencies>;
  readonly offline?: boolean;
}

async function launch(
  expenses: readonly Expense[],
  initialUrl: string,
  { trips = [BUDGET_TRIP], overrides = {}, offline = false }: LaunchOptions = {},
) {
  const storage = await seededBudgetDatabase(trips, expenses);
  const factory = new FakeHttpClientFactory();
  const http = stubFrankfurter(factory, RATES);
  if (offline) http.otherwise(() => apiFailure(new ApiError('offline', 'No connection')));
  const dependencies = createTestDependencies({
    database: storage.database,
    clock: new ManualClock(TRIPS_NOW),
    httpClientFactory: factory,
    ...overrides,
  });
  const container = { dependencies, store: createTestStore(dependencies), i18n: createI18n('en') };

  await renderRouter(
    {
      _layout: () => (
        <AppProviders container={container}>
          <Stack screenOptions={{ headerShown: false }} />
        </AppProviders>
      ),
      'budget/index': BudgetRoute,
      'budget/[tripId]/index': TripBudgetRoute,
      'budget/[tripId]/expenses/index': ExpenseHistoryRoute,
      'budget/[tripId]/expenses/new': NewExpenseRoute,
      'budget/[tripId]/expenses/[expenseId]/index': ExpenseRoute,
      'budget/[tripId]/expenses/[expenseId]/edit': EditExpenseRoute,
      'budget/[tripId]/breakdown': BreakdownRoute,
      'trips/[tripId]/index': TripRoute,
      'trips/new': NewTripRoute,
    },
    { initialUrl },
  );
  return { ...storage, dependencies, factory, http, user: userEvent.setup() };
}

async function savedExpenses(repository: Awaited<ReturnType<typeof launch>>['expenseRepository']) {
  const result = await repository.listByTrip(TRIP_OWNER, 'trip-1');
  if (!result.ok) throw result.error;
  return result.value;
}

const button = (name: string | RegExp) => screen.findByRole('button', { name });
const rowIds = () => screen.getAllByTestId(/^expense-row-/).map((node) => node.props.testID);
const STORAGE_ERROR = "We couldn't access data saved on this device.";

describe('Budget overview', () => {
  it('invites the traveller to plan a trip when there are none', async () => {
    const { user } = await launch([], '/budget', { trips: [] });

    await user.press(await button('Plan a trip'));

    expect(await screen.findByLabelText('Trip name')).toBeOnTheScreen();
  });

  it('shows the budget, what was spent, what remains and spending by category', async () => {
    await launch([dinner, tram], '/budget');

    const overview = await screen.findByTestId('budget-overview');
    expect(within(overview).getByText('Lisbon getaway')).toBeOnTheScreen();
    expect(within(overview).getByText('$1,000.00')).toBeOnTheScreen();
    expect(within(overview).getByText('$67.11')).toBeOnTheScreen();
    expect(within(overview).getByText('$932.89')).toBeOnTheScreen();
    expect(within(overview).getByRole('progressbar')).toHaveAccessibilityValue({ min: 0, max: 100, now: 7 });
    expect(within(overview).getByText('Food')).toBeOnTheScreen();
    expect(within(overview).getByText('Transport')).toBeOnTheScreen();
  });

  it('opens the ongoing trip by default', async () => {
    const rome = storedTrip({ id: 'rome', title: 'Rome week', startDate: '2027-06-14', endDate: '2027-06-18' });
    await launch([], '/budget', { trips: [BUDGET_TRIP, rome] });

    expect(within(await screen.findByTestId('budget-overview')).getByText('Rome week')).toBeOnTheScreen();
  });

  it('shows how far over budget the trip is, with the bar full and the true percentage', async () => {
    await launch([expense({ amount: 6000, baseAmount: 6000 })], '/budget/trip-1', {
      trips: [{ ...BUDGET_TRIP, budget: 5000 }],
    });

    expect(await screen.findByText('Over budget by $10.00')).toBeOnTheScreen();
    expect(screen.getByText(/120%/)).toBeOnTheScreen();
    expect(screen.getByRole('progressbar')).toHaveAccessibilityValue({ min: 0, max: 100, now: 100 });
  });

  it('lists expenses that are not in the totals yet and converts them on Try again', async () => {
    const { user, factory } = await launch(
      [
        dinner,
        unconvertedExpense({ id: 'ramen', createdAt: 3 }),
        unconvertedExpense({ id: 'sushi', amount: 3000, createdAt: 4 }),
      ],
      '/budget/trip-1',
      { offline: true },
    );

    expect(await screen.findByText("2 expenses aren't in the totals yet")).toBeOnTheScreen();
    expect(screen.getAllByText('$45.50').length).toBeGreaterThan(0);

    stubFrankfurter(factory, RATES);
    await user.press(await button('Try again'));

    await waitFor(() => expect(screen.queryByText("2 expenses aren't in the totals yet")).toBeNull());
    expect((await screen.findAllByText('$72.95')).length).toBeGreaterThan(0);
  });

  it('shows a storage failure with a retry that recovers', async () => {
    const storage = await seededBudgetDatabase([BUDGET_TRIP], [dinner]);
    const working = createTestDependencies({ database: storage.database, clock: new ManualClock(TRIPS_NOW) });
    const getTripBudget = {
      execute: jest
        .fn()
        .mockResolvedValueOnce(err(new AppError('storage', 'locked')))
        .mockImplementation((tripId: string) => working.getTripBudget.execute(tripId)),
    };
    const { user } = await launch([], '/budget/trip-1', {
      trips: [],
      overrides: { database: storage.database, getTripBudget },
    });

    expect(await screen.findByText(STORAGE_ERROR)).toBeOnTheScreen();
    await user.press(await button('Try again'));
    expect((await screen.findAllByText('$45.50')).length).toBeGreaterThan(0);
  });

  it('says when the trip does not exist', async () => {
    await launch([], '/budget/gone', { trips: [] });
    expect(await screen.findByText('Trip not found')).toBeOnTheScreen();
  });

  it('opens from the trip details', async () => {
    const { user } = await launch([dinner], '/trips/trip-1');

    await user.press(await button(/^Budget/));

    expect(await screen.findByTestId('budget-overview')).toBeOnTheScreen();
  });
});

describe('Expense history', () => {
  it('lists the expenses newest first with original and converted amounts', async () => {
    await launch(
      [dinner, tram, unconvertedExpense({ id: 'ramen', date: '2027-06-12', createdAt: 3 })],
      '/budget/trip-1/expenses',
    );

    await screen.findByTestId('expense-history');
    expect(rowIds()).toEqual(['expense-row-tram', 'expense-row-ramen', 'expense-row-dinner']);
    const tramRow = screen.getByTestId('expense-row-tram');
    expect(within(tramRow).getByText('€20.00')).toBeOnTheScreen();
    expect(within(tramRow).getByText('$21.61')).toBeOnTheScreen();
    expect(within(screen.getByTestId('expense-row-ramen')).getByText('Not converted yet')).toBeOnTheScreen();
  });

  it('filters by category', async () => {
    const { user } = await launch([dinner, tram], '/budget/trip-1/expenses');
    await screen.findByTestId('expense-history');

    await user.press(screen.getByRole('button', { name: 'Transport' }));

    await waitFor(() => expect(rowIds()).toEqual(['expense-row-tram']));
  });

  it('opens an expense', async () => {
    const { user } = await launch([dinner, tram], '/budget/trip-1/expenses');

    await user.press(within(await screen.findByTestId('expense-row-tram')).getByText('Tram tickets'));

    expect(await screen.findByTestId('expense-details')).toBeOnTheScreen();
  });
});

describe('Add expense', () => {
  it('saves the expense in SQLite, shows it in the history and updates the totals', async () => {
    const { user, expenseRepository } = await launch([], '/budget/trip-1');
    await screen.findByTestId('budget-overview');

    await user.press(await button('Add expense'));
    await user.type(await screen.findByLabelText('Title'), 'Museum ticket');
    await user.type(screen.getByLabelText('Amount'), '12.50');
    await user.press(screen.getByRole('button', { name: 'Activities' }));
    await user.press(screen.getByRole('button', { name: 'Cash' }));
    await user.type(screen.getByLabelText('Notes'), 'Student price');
    await user.press(await button('Save expense'));

    expect(await screen.findByTestId('budget-overview')).toBeOnTheScreen();
    expect((await screen.findAllByText('$987.50')).length).toBeGreaterThan(0);
    expect(await savedExpenses(expenseRepository)).toEqual([
      expect.objectContaining({
        title: 'Museum ticket',
        amount: 1250,
        currency: 'USD',
        baseCurrency: 'USD',
        baseAmount: 1250,
        category: 'activities',
        paymentMethod: 'cash',
        notes: 'Student price',
        date: '2027-06-10',
      }),
    ]);

    await user.press(await button('Expense history'));
    expect(within(await screen.findByTestId('expense-history')).getByText('Museum ticket')).toBeOnTheScreen();
  });

  it('shows what is wrong inline and saves nothing', async () => {
    const { user, expenseRepository } = await launch([], '/budget/trip-1/expenses/new');

    await user.type(await screen.findByLabelText('Amount'), '-5');
    await user.press(await button('Save expense'));

    expect(await screen.findByText('Give the expense a name.')).toBeOnTheScreen();
    expect(screen.getByText('Enter an amount above zero.')).toBeOnTheScreen();
    expect(await savedExpenses(expenseRepository)).toEqual([]);
  });

  it('saves once when Save is tapped twice', async () => {
    const { user, expenseRepository } = await launch([], '/budget/trip-1/expenses/new');
    await user.type(await screen.findByLabelText('Title'), 'Taxi');
    await user.type(screen.getByLabelText('Amount'), '18');

    const save = await button('Save expense');
    fireEvent.press(save);
    fireEvent.press(save);

    await waitFor(async () => expect(await savedExpenses(expenseRepository)).toHaveLength(1));
  });

  it('asks before discarding unsaved changes', async () => {
    const { user, expenseRepository } = await launch([], '/budget/trip-1');
    await act(async () => router.push('/budget/trip-1/expenses/new' as Href));
    await user.type(await screen.findByLabelText('Title'), 'Draft');

    await act(async () => router.back());
    expect(await screen.findByText('Discard your changes?')).toBeOnTheScreen();
    await user.press(await button('Keep editing'));
    expect(screen.getByLabelText('Title')).toHaveDisplayValue('Draft');

    await act(async () => router.back());
    await user.press(await button('Discard'));
    expect(await screen.findByTestId('budget-overview')).toBeOnTheScreen();
    expect(await savedExpenses(expenseRepository)).toEqual([]);
  });

  it('says when the trip is gone', async () => {
    await launch([], '/budget/gone/expenses/new', { trips: [] });
    expect(await screen.findByText('Trip not found')).toBeOnTheScreen();
  });
});

describe('Expense details', () => {
  it('shows the original and converted amounts with the rate and its date', async () => {
    await launch([tram], '/budget/trip-1/expenses/tram');

    const details = await screen.findByTestId('expense-details');
    expect(within(details).getByText('Tram tickets')).toBeOnTheScreen();
    expect(within(details).getByText('€20.00')).toBeOnTheScreen();
    expect(within(details).getByText('$21.61')).toBeOnTheScreen();
    expect(within(details).getByText(/^Rate 1 EUR = 1\.0805 USD · (12 Jun 2027|Jun 12, 2027)$/)).toBeOnTheScreen();
    expect(within(details).getByText('Transport')).toBeOnTheScreen();
    expect(within(details).getByText('Card')).toBeOnTheScreen();
  });

  it('labels a fallback rate as approximate', async () => {
    await launch(
      [
        euroExpense({
          id: 'tram',
          exchangeRate: { rate: '1.07', rateDate: '2027-06-10', source: 'fallback' },
          baseAmount: 2140,
        }),
      ],
      '/budget/trip-1/expenses/tram',
    );

    const details = await screen.findByTestId('expense-details');
    expect(within(details).getByText(/approximate/i)).toBeOnTheScreen();
    expect(within(details).getByText(/1 EUR = 1\.07 USD/)).toBeOnTheScreen();
  });

  it('says when an expense is not converted yet', async () => {
    await launch([unconvertedExpense({ id: 'ramen' })], '/budget/trip-1/expenses/ramen', { offline: true });

    const details = await screen.findByTestId('expense-details');
    expect(within(details).getByText('¥1,500')).toBeOnTheScreen();
    expect(within(details).getByText('Not converted yet')).toBeOnTheScreen();
  });

  it('deletes only after confirmation, then goes back to the history', async () => {
    const { user, expenseRepository } = await launch([dinner, tram], '/budget/trip-1/expenses');
    await user.press(within(await screen.findByTestId('expense-row-tram')).getByText('Tram tickets'));

    await user.press(await button('Delete expense'));
    expect(await screen.findByText('Delete this expense?')).toBeOnTheScreen();
    await user.press(await button('Keep expense'));
    expect(await savedExpenses(expenseRepository)).toHaveLength(2);

    await user.press(await button('Delete expense'));
    await user.press(await button('Delete'));

    expect(await screen.findByTestId('expense-history')).toBeOnTheScreen();
    await waitFor(() => expect(rowIds()).toEqual(['expense-row-dinner']));
    expect((await savedExpenses(expenseRepository)).map(({ id }) => id)).toEqual(['dinner']);
  });

  it('says when the expense does not exist', async () => {
    await launch([], '/budget/trip-1/expenses/gone');
    expect(await screen.findByText('Expense not found')).toBeOnTheScreen();
  });

  it("treats another account's expense as not found", async () => {
    const storage = await seededBudgetDatabase([], []);
    await storage.tripRepository.insert(OTHER_TRIP_OWNER, storedTrip({ id: 'theirs' }));
    await storage.expenseRepository.insert(
      OTHER_TRIP_OWNER,
      expense({ id: 'secret', tripId: 'theirs', title: 'Secret' }),
    );
    await launch([], '/budget/theirs/expenses/secret', { trips: [], overrides: { database: storage.database } });

    expect((await screen.findAllByText(/not found/)).length).toBeGreaterThan(0);
    expect(screen.queryByText('Secret')).toBeNull();
  });

  it('says when the trip is gone', async () => {
    await launch([], '/budget/gone/expenses/dinner', { trips: [] });
    expect((await screen.findAllByText(/not found/)).length).toBeGreaterThan(0);
  });
});

describe('Edit expense', () => {
  it('starts from the saved expense and stores the change, updating the details', async () => {
    const { user, expenseRepository } = await launch([dinner], '/budget/trip-1/expenses/dinner');
    await user.press(await button('Edit expense'));

    const title = await screen.findByLabelText('Title');
    expect(title).toHaveDisplayValue('Dinner');
    expect(screen.getByLabelText('Amount')).toHaveDisplayValue('45.5');
    expect(screen.getByRole('button', { name: 'Food' })).toBeSelected();

    await user.clear(screen.getByLabelText('Amount'));
    await user.type(screen.getByLabelText('Amount'), '60');
    await user.press(await button('Save changes'));

    const details = await screen.findByTestId('expense-details');
    expect(await within(details).findByText('$60.00')).toBeOnTheScreen();
    expect((await savedExpenses(expenseRepository))[0]).toMatchObject({ amount: 6000, baseAmount: 6000 });
  });

  it('says when the expense no longer exists', async () => {
    await launch([], '/budget/trip-1/expenses/gone/edit');
    expect(await screen.findByText('Expense not found')).toBeOnTheScreen();
  });
});

describe('Spending breakdown', () => {
  it('draws a labelled bar for each category with spending and for each day', async () => {
    await launch([dinner, tram], '/budget/trip-1/breakdown');

    const food = await screen.findByTestId('category-bar-food');
    expect(food.props.accessibilityLabel).toMatch(/Food/);
    expect(food.props.accessibilityLabel).toMatch(/\$45\.50/);
    expect(food.props.accessibilityLabel).toMatch(/68%/);
    expect(screen.getByTestId('category-bar-transport').props.accessibilityLabel).toMatch(/\$21\.61.*32%/);
    expect(screen.queryByTestId('category-bar-shopping')).toBeNull();

    expect(screen.getByTestId('daily-bar-2027-06-11').props.accessibilityLabel).toMatch(/\$45\.50/);
    expect(screen.getByTestId('daily-bar-2027-06-13').props.accessibilityLabel).toMatch(/\$21\.61/);
    expect(screen.getByTestId('daily-bar-2027-06-10').props.accessibilityLabel).toMatch(/\$0\.00/);
  });

  it('shows an empty state instead of empty bars when nothing is converted', async () => {
    await launch([unconvertedExpense()], '/budget/trip-1/breakdown', { offline: true });

    expect(await screen.findByText('Nothing to chart yet')).toBeOnTheScreen();
    expect(screen.queryByTestId(/^category-bar-/)).toBeNull();
    expect(screen.queryByTestId(/^daily-bar-/)).toBeNull();
  });
});
