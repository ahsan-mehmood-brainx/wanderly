import { AppError, toAppError } from '@/core/errors/AppError';
import { err, type Result } from '@/core/result';
import { type Clock } from '@/core/utils/Clock';

export interface MemoryCacheOptions<T = unknown> {
  readonly ttlMs: number;
  /** Oldest entries are evicted beyond this. */
  readonly maxEntries: number;
  readonly clock: Clock;
  /**
   * Successes for which this returns false are returned but not kept, e.g. a saved
   * copy shown because a refresh failed, which must not hide the next refresh.
   */
  readonly shouldCache?: (value: T) => boolean;
}

/**
 * Small TTL + LRU cache for `Result`-returning loads, with request coalescing.
 *
 * - Only successes are cached (and only those `shouldCache` accepts), so a failure
 *   (offline, rate limited) is retried next time.
 * - Concurrent loads of the same key share one request. The shared request is not
 *   tied to any caller's `AbortSignal`: if one caller cancels, it gets `cancelled`
 *   while the request completes for the others and fills the cache.
 */
export class MemoryCache<T> {
  private readonly entries = new Map<string, { readonly value: T; readonly expiresAt: number }>();
  private readonly inFlight = new Map<string, Promise<Result<T, AppError>>>();

  constructor(private readonly options: MemoryCacheOptions<T>) {}

  async get(key: string, load: () => Promise<Result<T, AppError>>, signal?: AbortSignal): Promise<Result<T, AppError>> {
    if (signal?.aborted) return err(cancelled());

    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > this.options.clock.now()) {
      // Refresh recency for LRU eviction.
      this.entries.delete(key);
      this.entries.set(key, cached);
      return { ok: true, value: cached.value };
    }
    if (cached) this.entries.delete(key);

    let pending = this.inFlight.get(key);
    if (!pending) {
      pending = load().then(
        (result) => {
          this.inFlight.delete(key);
          if (result.ok && (this.options.shouldCache?.(result.value) ?? true)) this.store(key, result.value);
          return result;
        },
        // Loaders return Results by contract; a throw must still not leave a stuck in-flight entry.
        (cause: unknown) => {
          this.inFlight.delete(key);
          return err(toAppError(cause));
        },
      );
      this.inFlight.set(key, pending);
    }
    return signal ? raceAbort(pending, signal) : pending;
  }

  clear(): void {
    this.entries.clear();
  }

  private store(key: string, value: T): void {
    this.entries.set(key, { value, expiresAt: this.options.clock.now() + this.options.ttlMs });
    while (this.entries.size > this.options.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}

const cancelled = () => new AppError('cancelled', 'Request was cancelled');

function raceAbort<T>(promise: Promise<Result<T, AppError>>, signal: AbortSignal): Promise<Result<T, AppError>> {
  if (signal.aborted) return Promise.resolve(err(cancelled()));
  return new Promise((resolve) => {
    const onAbort = () => resolve(err(cancelled()));
    signal.addEventListener('abort', onAbort, { once: true });
    void promise.then((result) => {
      signal.removeEventListener('abort', onAbort);
      resolve(result);
    });
  });
}
