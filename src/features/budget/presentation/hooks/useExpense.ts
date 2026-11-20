import { useAppSelector } from '@/core/store/hooks';

import { selectExpenseById } from '../state/selectors';
import { useTripBudget } from './useTripBudget';

/** One expense of the trip as stored; `expense` is undefined while loading or when it doesn't exist. */
export function useExpense(tripId: string, id: string) {
  const budget = useTripBudget(tripId, { convert: false });
  const stored = useAppSelector((state) => selectExpenseById(state, id));
  // A link may pair an expense with the wrong trip; it only exists within its own.
  const expense = stored?.tripId === tripId ? stored : undefined;
  return { ...budget, expense };
}
