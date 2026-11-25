import { type Expense } from '@/features/budget/domain/Expense';
import { withStatus } from '@/features/trips/domain/tripStatus';
import { type StoredTrip, type Trip } from '@/features/trips/domain/Trip';
import { expense, unconvertedExpense } from '@/testing/budgetFixtures';
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

describe('evaluateBudgetAlerts', () => {
  it('AC5 sends one alert with the trip title and percent when spending reaches the threshold', () => {
    expect(evaluate()).toEqual({
      toSend: [{ tripId: 'trip-1', tripTitle: 'Lisbon getaway', percentSpent: 8000, thresholdPercent: 80 }],
      nextAlerted: { 'trip-1': 80 },
    });
  });

  it('AC5 sends nothing just below the threshold', () => {
    expect(evaluate({ expensesByTrip: { [TRIP.id]: [spent(TRIP.id, 79_994)] } })).toEqual({
      toSend: [],
      nextAlerted: {},
    });
  });

  it('AC5 does not send again for a trip already alerted at this threshold', () => {
    const result = evaluate({
      expensesByTrip: { [TRIP.id]: [spent(TRIP.id, 95_000)] },
      alerted: { 'trip-1': 80 },
    });

    expect(result.toSend).toEqual([]);
    expect(result.nextAlerted).toEqual({ 'trip-1': 80 });
  });

  it('AC5 re-arms the alert once spending drops below the threshold (expense deleted or budget raised)', () => {
    const below = evaluate({ expensesByTrip: { [TRIP.id]: [spent(TRIP.id, 50_000)] }, alerted: { 'trip-1': 80 } });
    expect(below).toEqual({ toSend: [], nextAlerted: {} });

    const raised = evaluate({ trips: trips({ ...TRIP, budget: 200_000 }), alerted: { 'trip-1': 80 } });
    expect(raised).toEqual({ toSend: [], nextAlerted: {} });

    const again = evaluate({ alerted: below.nextAlerted });
    expect(again.toSend).toHaveLength(1);
  });

  it('AC5 evaluates a changed threshold against the new value', () => {
    const raisedAbove = evaluate({
      expensesByTrip: { [TRIP.id]: [spent(TRIP.id, 85_000)] },
      thresholdPercent: 90,
      alerted: { 'trip-1': 80 },
    });
    expect(raisedAbove).toEqual({ toSend: [], nextAlerted: {} });

    const crossedNew = evaluate({
      expensesByTrip: { [TRIP.id]: [spent(TRIP.id, 95_000)] },
      thresholdPercent: 90,
      alerted: { 'trip-1': 80 },
    });
    expect(crossedNew).toEqual({
      toSend: [{ tripId: 'trip-1', tripTitle: 'Lisbon getaway', percentSpent: 9500, thresholdPercent: 90 }],
      nextAlerted: { 'trip-1': 90 },
    });

    const lowered = evaluate({
      expensesByTrip: { [TRIP.id]: [spent(TRIP.id, 60_000)] },
      thresholdPercent: 50,
      alerted: { 'trip-1': 80 },
    });
    expect(lowered.toSend.map(({ thresholdPercent }) => thresholdPercent)).toEqual([50]);
  });

  it('AC5 alerts for upcoming trips too', () => {
    const upcoming = { ...TRIP, startDate: '2027-07-01', endDate: '2027-07-05' };

    expect(evaluate({ trips: trips(upcoming) }).toSend).toHaveLength(1);
  });

  it('AC5 never alerts for completed or cancelled trips', () => {
    const completed = { ...TRIP, startDate: '2027-06-01', endDate: '2027-06-05' };
    const cancelled = { ...TRIP, cancelledAt: 1 };

    expect(evaluate({ trips: trips(completed) }).toSend).toEqual([]);
    expect(evaluate({ trips: trips(cancelled) }).toSend).toEqual([]);
  });

  it('AC5 never alerts for a trip without a budget', () => {
    expect(evaluate({ trips: trips({ ...TRIP, budget: 0 }) }).toSend).toEqual([]);
  });

  it('AC5 counts only expenses converted into the trip currency', () => {
    const result = evaluate({
      expensesByTrip: {
        [TRIP.id]: [
          spent(TRIP.id, 70_000),
          unconvertedExpense({ id: 'exp-jpy', tripId: 'trip-1', amount: 5_000_000 }),
          expense({ id: 'exp-eur', tripId: 'trip-1', baseCurrency: 'EUR', baseAmount: 50_000 }),
        ],
      },
    });

    expect(result.toSend).toEqual([]);
  });

  it('AC5 forgets trips that no longer exist', () => {
    const result = evaluate({ trips: trips(), expensesByTrip: {}, alerted: { 'trip-1': 80, 'gone-trip': 90 } });

    expect(result).toEqual({ toSend: [], nextAlerted: {} });
  });

  it('AC5 evaluates each trip on its own', () => {
    const other = storedTrip({
      id: 'trip-2',
      title: 'Kyoto',
      startDate: '2027-06-10',
      endDate: '2027-06-30',
      budget: 10_000,
    });
    const result = evaluate({
      trips: trips(TRIP, other),
      expensesByTrip: { [TRIP.id]: [spent(TRIP.id, 10_000)], [other.id]: [spent(other.id, 12_000)] },
      alerted: { 'trip-1': 80 },
    });

    expect(result).toEqual({
      toSend: [{ tripId: 'trip-2', tripTitle: 'Kyoto', percentSpent: 12000, thresholdPercent: 80 }],
      nextAlerted: { 'trip-2': 80 },
    });
  });
});
