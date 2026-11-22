import { type AppError, type AppErrorKind } from '@/core/errors/AppError';

export type SyncRetryDecision = { readonly retry: true; readonly delayMs: number } | { readonly retry: false };

/** Decides whether a failed push is tried again, and when. */
export interface SyncRetryPolicy {
  /** `attempt` counts this failed attempt (1 for the first). */
  decide(attempt: number, error: AppError): SyncRetryDecision;
}

export interface ExponentialSyncRetryOptions {
  /** Delay after the first failure. */
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
  /** Attempts before the operation is marked failed. */
  readonly maxAttempts?: number;
  /** ±fraction of random spread, so many devices recovering from one outage don't retry in step. */
  readonly jitter?: number;
  readonly random?: () => number;
}

/** Failures a later attempt can fix. `badRequest`, `parse`, `forbidden` and the like would fail the same way again. */
export const RETRYABLE_SYNC_ERRORS: ReadonlySet<AppErrorKind> = new Set([
  'network',
  'timeout',
  'rateLimited',
  'server',
  'storage',
]);

/**
 * Exponential backoff with jitter: 5 s, 10 s, 20 s … capped at 30 min, then
 * failed after 8 attempts. A server's `Retry-After` is honoured when longer.
 * Going offline is not an attempt: the engine pauses without asking the policy.
 */
export class ExponentialSyncRetryPolicy implements SyncRetryPolicy {
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly maxAttempts: number;
  private readonly jitter: number;
  private readonly random: () => number;

  constructor(options: ExponentialSyncRetryOptions = {}) {
    this.baseDelayMs = options.baseDelayMs ?? 5_000;
    this.maxDelayMs = options.maxDelayMs ?? 30 * 60_000;
    this.maxAttempts = options.maxAttempts ?? 8;
    this.jitter = options.jitter ?? 0.2;
    this.random = options.random ?? Math.random;
  }

  decide(attempt: number, error: AppError): SyncRetryDecision {
    if (!RETRYABLE_SYNC_ERRORS.has(error.kind) || attempt >= this.maxAttempts) return { retry: false };
    const exponential = Math.min(this.maxDelayMs, this.baseDelayMs * 2 ** Math.max(0, attempt - 1));
    const spread = 1 + (this.random() * 2 - 1) * this.jitter;
    const retryAfterMs = 'retryAfterMs' in error && typeof error.retryAfterMs === 'number' ? error.retryAfterMs : 0;
    return { retry: true, delayMs: Math.max(Math.round(exponential * spread), retryAfterMs) };
  }
}
