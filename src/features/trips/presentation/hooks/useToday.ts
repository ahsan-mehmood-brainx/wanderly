import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useDependencies } from '@/core/di/DependenciesProvider';

import { type LocalDate, localDateAt } from '../../domain/localDate';

const CHECK_INTERVAL_MS = 60_000;

/**
 * Today's date on the device. Re-renders only when the date changes: at midnight
 * or on returning from the background (a stack screen can stay mounted for days).
 */
export function useToday(): LocalDate {
  const { clock } = useDependencies();
  const [today, setToday] = useState(() => localDateAt(clock.now()));

  useEffect(() => {
    const check = () => setToday(localDateAt(clock.now()));
    check();
    const timer = setInterval(check, CHECK_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [clock]);

  return today;
}
