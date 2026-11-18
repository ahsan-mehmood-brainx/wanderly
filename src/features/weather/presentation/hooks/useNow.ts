import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { type Clock } from '@/core/utils/Clock';

/** Once a minute is enough for "Updated 5 minutes ago" and to move "Now" to the next hour on time. */
export const NOW_TICK_MS = 60_000;

/**
 * The current time, kept current while the component stays mounted: it ticks
 * every {@link NOW_TICK_MS} and jumps forward when the app returns to the
 * foreground (screens in a stack can stay mounted for hours in the background).
 */
export function useNow(clock: Clock, intervalMs = NOW_TICK_MS): number {
  const [now, setNow] = useState(() => clock.now());

  useEffect(() => {
    const tick = () => setNow(clock.now());
    const timer = setInterval(tick, intervalMs);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [clock, intervalMs]);

  return now;
}
