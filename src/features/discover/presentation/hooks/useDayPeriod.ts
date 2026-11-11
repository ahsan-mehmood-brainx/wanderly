import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { type DayPeriod, getDayPeriod } from '../../domain/dayPeriod';

/** The app can stay mounted for hours in the background, so recompute the period on every return to the foreground. */
export function useDayPeriod(now: () => Date): DayPeriod {
  const [period, setPeriod] = useState(() => getDayPeriod(now().getHours()));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setPeriod(getDayPeriod(now().getHours()));
    });
    return () => subscription.remove();
  }, [now]);

  return period;
}
