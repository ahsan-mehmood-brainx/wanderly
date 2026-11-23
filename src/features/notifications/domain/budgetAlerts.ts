import { summarizeBudget } from '@/features/budget/domain/budgetCalculations';
import { type Expense } from '@/features/budget/domain/Expense';
import { type Trip } from '@/features/trips/domain/Trip';

import { type BudgetThresholdPercent } from './NotificationSettings';

export interface BudgetAlertInput {
  /** The owner's trips with their status today. */
  readonly trips: readonly Trip[];
  /** Trip id → its expenses. */
  readonly expensesByTrip: Readonly<Record<string, readonly Expense[]>>;
  readonly thresholdPercent: BudgetThresholdPercent;
  /** Trip id → threshold an alert was already sent for. */
  readonly alerted: Readonly<Record<string, number>>;
}

export interface BudgetAlert {
  readonly tripId: string;
  readonly tripTitle: string;
  /** Basis points of the budget spent (8000 = 80%). */
  readonly percentSpent: number;
  readonly thresholdPercent: BudgetThresholdPercent;
}

export interface BudgetAlertEvaluation {
  readonly toSend: readonly BudgetAlert[];
  readonly nextAlerted: Readonly<Record<string, number>>;
}

/**
 * Which trips crossed the threshold since their last alert, and what to remember afterwards.
 * Only upcoming and ongoing trips with a budget count. A trip below the threshold (or no
 * longer there) is forgotten, so crossing it again alerts again; a trip alerted at another
 * threshold is judged against the current one.
 */
export function evaluateBudgetAlerts(input: BudgetAlertInput): BudgetAlertEvaluation {
  const { trips, expensesByTrip, thresholdPercent, alerted } = input;
  const toSend: BudgetAlert[] = [];
  const nextAlerted: Record<string, number> = {};

  for (const trip of trips) {
    if (trip.status !== 'upcoming' && trip.status !== 'ongoing') continue;
    const percentSpent = summarizeBudget(trip, expensesByTrip[trip.id] ?? []).percentSpent;
    if (percentSpent === null || percentSpent < thresholdPercent * 100) continue;

    nextAlerted[trip.id] = thresholdPercent;
    if (alerted[trip.id] !== thresholdPercent) {
      toSend.push({ tripId: trip.id, tripTitle: trip.title, percentSpent, thresholdPercent });
    }
  }

  return { toSend, nextAlerted };
}
