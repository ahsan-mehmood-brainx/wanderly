import { useEffect, useReducer } from 'react';

import { type Clock } from '@/core/utils/Clock';

const secondsUntil = (lockedUntil: number | null, now: number) =>
  lockedUntil === null ? 0 : Math.max(0, Math.ceil((lockedUntil - now) / 1000));

/**
 * Whole seconds left in a sign-in cooldown; 0 when sign-in is allowed.
 * Derived from the clock on every render; the interval only asks for a re-render once a second.
 */
export function useLockoutCountdown(lockedUntil: number | null, clock: Clock): number {
  const [, tick] = useReducer((count: number) => count + 1, 0);
  const secondsLeft = secondsUntil(lockedUntil, clock.now());
  const active = secondsLeft > 0;

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [active, lockedUntil]);

  return secondsLeft;
}
