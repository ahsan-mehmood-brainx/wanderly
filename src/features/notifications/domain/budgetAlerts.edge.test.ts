import { type Expense } from '@/features/budget/domain/Expense';
import { withStatus } from '@/features/trips/domain/tripStatus';
import { type StoredTrip, type Trip } from '@/features/trips/domain/Trip';
import { expense } from '@/testing/budgetFixtures';
import { storedTrip } from '@/testing/tripFixtures';

import { type BudgetAlertInput, evaluateBudgetAlerts } from './budgetAlerts';

const TODAY = '2027-06-15';

/** $1,000.00 budget, ongoing today. */
const TRIP = storedTrip({
  id: 'trip-1',
  title: 'Lisbon getaway',
  startDate: '2027-06-14',
  endDate: '2027-06-20',
  budget: 100_000,
  currency: 'USD',
});

const spent = (tripId: string, cents: number, id = `exp-${tripId}-${cents}`): Expense =>
  expense({ id, tripId, amount: cents, baseAmount: cents, date: TODAY });

const trips = (...stored: StoredTrip[]): Trip[] => stored.map((trip) => withStatus(trip, TODAY));

function evaluate(overrides: Partial<BudgetAlertInput> = {}) {
  return evaluateBudgetAlerts({
    trips: trips(TRIP),
    expensesByTrip: { [TRIP.id]: [spent(TRIP.id, 80_000)] },
    thresholdPercent: 80,
    alerted: {},
    ...overrides,
  });
}

describe('evaluateBudgetAlerts boundaries', () => {
  it.each([50, 75, 80, 90, 100] as const)(
    'AC5 alerts once spending rounds to %i%% in basis points (half-up, as the Budget screen shows it) and not below',
    (threshold) => {
      // $1,000 budget: 1 basis point is 10 cents, so 5 cents short still rounds up to the threshold.
      const atThreshold = threshold * 1000;
      const roundsUp = evaluate({
        thresholdPercent: threshold,
        expensesByTrip: { [TRIP.id]: [spent(TRIP.id, atThreshold - 5)] },
      });
      const roundsDown = evaluate({
        thresholdPercent: threshold,
        expensesByTrip: { [TRIP.id]: [spent(TRIP.id, atThreshold - 6)] },
      });

      expect(roundsUp.toSend).toEqual([expect.objectContaining({ percentSpent: threshold * 100 })]);
      expect(roundsDown.toSend).toEqual([]);
    },
  );

  it('AC5 reports the real percent when spending is well over the budget', () => {
    const { toSend } = evaluate({ thresholdPercent: 100, expensesByTrip: { [TRIP.id]: [spent(TRIP.id, 250_000)] } });

    expect(toSend).toEqual([
      expect.objectContaining({ tripId: 'trip-1', percentSpent: 25_000, thresholdPercent: 100 }),
    ]);
  });

  it('AC5 never alerts for a trip with a zero budget, however much is spent', () => {
    const noBudget = storedTrip({ ...TRIP, budget: 0 });

    const { toSend, nextAlerted } = evaluate({ trips: trips(noBudget) });

    expect(toSend).toEqual([]);
    expect(nextAlerted).toEqual({});
  });

  it('AC5 sends nothing for a trip with no expense list', () => {
    expect(evaluate({ expensesByTrip: {} }).toSend).toEqual([]);
  });

  it('AC5 remembers a trip once alerted even when no new expense is added', () => {
    const first = evaluate();
    const second = evaluate({ alerted: first.nextAlerted });

    expect(first.toSend).toHaveLength(1);
    expect(second.toSend).toEqual([]);
    expect(second.nextAlerted).toEqual({ 'trip-1': 80 });
  });
});
