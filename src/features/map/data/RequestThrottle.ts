import { AppError } from '@/core/errors/AppError';
import { err, type Result } from '@/core/result';
import { sleep as abortableSleep } from '@/core/utils/async';
import { type Clock } from '@/core/utils/Clock';

/** Cooldown after a 429 without a `Retry-After`. */
export const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 30_000;

export interface RequestThrottleOptions {
  /** Minimum time between the starts of two tasks. */
  readonly minIntervalMs: number;
  readonly clock: Clock;
  /** Abort-aware wait; defaults to `sleep` from `core/utils/async`. */
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<boolean>;
}

const cancelled = () => new AppError('cancelled', 'Request was cancelled');
const coolingDown = () => new AppError('rateLimited', 'Waiting before asking this service again');

/** Resolves `true` once `promise` settles, or `false` as soon as `signal` aborts. */
function waitFor(promise: Promise<void>, signal?: AbortSignal): Promise<boolean> {
  if (!signal) return promise.then(() => true);
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const onAbort = () => resolve(false);
    signal.addEventListener('abort', onAbort, { once: true });
    void promise.then(() => {
      signal.removeEventListener('abort', onAbort);
      resolve(true);
    });
  });
}

/**
 * Runs tasks one at a time with a minimum interval between starts, and refuses
 * work (`rateLimited`, no task run) during a cooldown set after a 429.
 */
export class RequestThrottle {
  private tail: Promise<void> = Promise.resolve();
  private lastStartAt: number | null = null;
  private cooldownUntil = 0;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<boolean>;

  constructor(private readonly options: RequestThrottleOptions) {
    this.sleep = options.sleep ?? abortableSleep;
  }

  async run<T>(task: () => Promise<Result<T, AppError>>, signal?: AbortSignal): Promise<Result<T, AppError>> {
    if (signal?.aborted) return err(cancelled());
    if (this.isCoolingDown()) return err(coolingDown());

    // Queue behind every earlier task. The next caller waits for both the previous
    // task and this one, so leaving the queue early (cancelled) never lets two run at once.
    const previous = this.tail;
    let release: () => void = () => undefined;
    const done = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.tail = Promise.all([previous, done]).then(() => undefined);

    try {
      if (!(await waitFor(previous, signal))) return err(cancelled());
      // A 429 may have arrived while this task was queued.
      if (this.isCoolingDown()) return err(coolingDown());

      const { clock, minIntervalMs } = this.options;
      const waitMs = this.lastStartAt === null ? 0 : this.lastStartAt + minIntervalMs - clock.now();
      if (waitMs > 0 && !(await this.sleep(waitMs, signal))) return err(cancelled());
      if (signal?.aborted) return err(cancelled());

      this.lastStartAt = clock.now();
      return await task();
    } finally {
      release();
    }
  }

  /** Until `untilMs` (clock time), every `run` returns `rateLimited` without running its task. */
  coolDown(untilMs: number): void {
    this.cooldownUntil = Math.max(this.cooldownUntil, untilMs);
  }

  private isCoolingDown(): boolean {
    return this.options.clock.now() < this.cooldownUntil;
  }
}
