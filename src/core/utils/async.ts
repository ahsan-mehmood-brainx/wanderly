/** Sentinel returned by {@link withTimeout} when the deadline wins. A symbol, so it can never collide with a real value. */
export const TIMED_OUT = Symbol('timedOut');

/** Races `promise` against a deadline. The timer is always cleared, so a settled promise leaves nothing scheduled. */
export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Waits `ms`, or less if `signal` aborts first. Resolves (never rejects) so callers
 * branch on the outcome: `true` if the full delay elapsed, `false` if aborted.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve(true);
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
