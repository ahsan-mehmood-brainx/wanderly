import { type ApiError } from '../ApiError';
import { type HttpMethod } from '../HttpClient';

export interface RetryContext {
  /** Attempts made so far, including the one that just failed (1 after the first failure). */
  readonly attempt: number;
  readonly error: ApiError;
  readonly method: HttpMethod;
}

/**
 * Strategy deciding whether and when a failed request is retried. The client's
 * retry loop is fixed; behaviour varies by swapping the strategy per API or per request.
 */
export interface RetryStrategy {
  /** Delay before the next attempt, or `null` to give up and return the error. */
  getDelayMs(context: RetryContext): number | null;
}

/** Retrying a non-idempotent request (POST, PATCH) could apply it twice, so only these are retried. */
export const IDEMPOTENT_METHODS: ReadonlySet<HttpMethod> = new Set(['GET', 'PUT', 'DELETE']);

export const noRetry: RetryStrategy = { getDelayMs: () => null };

export interface ExponentialBackoffOptions {
  /** Retries after the first attempt. */
  readonly maxRetries?: number;
  readonly baseDelayMs?: number;
  /** Cap per delay. A `Retry-After` beyond this gives up instead of stalling the UI. */
  readonly maxDelayMs?: number;
  /** Injectable for deterministic tests. */
  readonly random?: () => number;
}

/**
 * Exponential backoff with "equal jitter": each delay is between half and all of
 * `base * 2^(attempt-1)` (capped), which spreads retries from many devices so a
 * recovering server isn't hit in lockstep. Honours `Retry-After` from 429/503 responses.
 */
export class ExponentialBackoffRetry implements RetryStrategy {
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly random: () => number;

  constructor({
    maxRetries = 2,
    baseDelayMs = 300,
    maxDelayMs = 5_000,
    random = Math.random,
  }: ExponentialBackoffOptions = {}) {
    this.maxRetries = maxRetries;
    this.baseDelayMs = baseDelayMs;
    this.maxDelayMs = maxDelayMs;
    this.random = random;
  }

  getDelayMs({ attempt, error, method }: RetryContext): number | null {
    if (attempt > this.maxRetries || !error.retryable || !IDEMPOTENT_METHODS.has(method)) return null;

    if (error.retryAfterMs !== undefined) {
      return error.retryAfterMs <= this.maxDelayMs ? error.retryAfterMs : null;
    }

    const ceiling = Math.min(this.maxDelayMs, this.baseDelayMs * 2 ** (attempt - 1));
    return Math.round(ceiling / 2 + this.random() * (ceiling / 2));
  }
}
