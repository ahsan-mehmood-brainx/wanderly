/** Time source port. Inject it instead of calling `Date.now()` so time-dependent logic is deterministic in tests. */
export interface Clock {
  /** Milliseconds since the Unix epoch. */
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };
