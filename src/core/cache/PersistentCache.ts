import { type AppError, type AppErrorKind } from '@/core/errors/AppError';
import { type Logger } from '@/core/logging/Logger';
import { type ConnectivityService, isOfflineState } from '@/core/network/ConnectivityService';
import { err, ok, type Result } from '@/core/result';
import { type Clock } from '@/core/utils/Clock';

import { type CacheRecord, type CacheStore } from './CacheStore';

/** How long stored data is trusted, and how long it may stand in for data that can't be refreshed. */
export interface PersistentCachePolicy {
  /** Younger than this, the stored copy is used without a request. */
  readonly freshForMs: number;
  /** Older than this, the stored copy is never shown (and is pruned). */
  readonly maxStaleMs: number;
  /** At most this many records are kept; the oldest go first. */
  readonly maxEntries: number;
}

/**
 * Validates what was stored. `decode` returns `{ value }` for a valid `T` (which may
 * itself be `null`, e.g. "no article"), and `null` for anything else.
 */
export interface CacheCodec<T> {
  encode(value: T): unknown;
  decode(raw: unknown): { readonly value: T } | null;
}

export interface PersistentCacheOptions<T> {
  readonly store: CacheStore;
  /** Unique per cache, e.g. `discover.countries`. */
  readonly namespace: string;
  /** Bump when the stored shape changes; older records are then ignored and replaced. */
  readonly version: number;
  readonly codec: CacheCodec<T>;
  readonly policy: PersistentCachePolicy;
  readonly clock: Clock;
  readonly logger: Logger;
  /** When given, back-off windows end as soon as the device comes back online. */
  readonly connectivity?: Pick<ConnectivityService, 'subscribe'>;
}

export interface CachedValue<T> {
  readonly value: T;
  /** `network`: just downloaded. `device`: read from the stored copy. */
  readonly source: 'network' | 'device';
  /** When the data was downloaded. */
  readonly storedAt: number;
  /**
   * Why a refresh failed, when the stored copy stands in for data that should have
   * been refreshed. `null` for fresh data (downloaded, or stored within `freshForMs`).
   */
  readonly refreshError: AppErrorKind | null;
}

/** Failures where showing an older copy is better than showing nothing. */
const FALLBACK_KINDS: ReadonlySet<AppErrorKind> = new Set(['offline', 'network', 'timeout', 'rateLimited', 'server']);
/**
 * After a 429 whose `Retry-After` says how long to wait, no request is made until
 * then and the stored copy (if any) is shown, so automatic refreshes (reconnect,
 * several screens) don't make the limit worse. Without `Retry-After`, and for
 * every other failure, "Try again" always makes a real request.
 */
const COOLDOWN_KINDS: ReadonlySet<AppErrorKind> = new Set(['rateLimited']);

const PRUNE_EVERY_WRITES = 25;

/**
 * Durable read-through cache for remote data, so destination information viewed
 * once can be shown again offline, after a restart, or while an API is failing.
 *
 * Policy per `get`:
 * 1. A stored copy younger than `freshForMs` is returned without a request.
 * 2. Otherwise `load()` runs. Success is stored and returned.
 * 3. If it fails in a way an older copy can paper over (offline, network, timeout,
 *    rate limited, server error), a stored copy younger than `maxStaleMs` is
 *    returned with `refreshError` set, so the UI can say it's a saved copy.
 * 4. `notFound` deletes the stored copy: the remote data is gone.
 *
 * The store is best effort. If it can't be read or written (database unavailable,
 * failed migration) the cache logs and behaves as network-only; it never fails a
 * load that the network could answer.
 */
export class PersistentCache<T> {
  private readonly cooldowns = new Map<string, { readonly until: number; readonly error: AppError }>();
  private writesSincePrune = PRUNE_EVERY_WRITES; // prune on the first write of each session

  constructor(private readonly options: PersistentCacheOptions<T>) {
    // A container singleton, so the subscription lives as long as the app.
    options.connectivity?.subscribe((state) => {
      if (!isOfflineState(state)) this.resetCooldowns();
    });
  }

  async get(key: string, load: () => Promise<Result<T, AppError>>): Promise<Result<CachedValue<T>, AppError>> {
    const { clock, policy } = this.options;
    const now = clock.now();
    const stored = await this.readStored(key, now);

    if (stored && now - stored.storedAt < policy.freshForMs) {
      return ok({ value: stored.value, source: 'device', storedAt: stored.storedAt, refreshError: null });
    }

    const cooldown = this.cooldowns.get(key);
    if (cooldown && cooldown.until > now) return this.fallback(stored, cooldown.error);
    if (cooldown) this.cooldowns.delete(key);

    const loaded = await load();
    if (loaded.ok) {
      const storedAt = clock.now();
      await this.writeStored(key, loaded.value, storedAt);
      return ok({ value: loaded.value, source: 'network', storedAt, refreshError: null });
    }

    const { error } = loaded;
    if (error.kind === 'notFound') await this.removeStored(key);
    const retryAfterMs = 'retryAfterMs' in error && typeof error.retryAfterMs === 'number' ? error.retryAfterMs : 0;
    if (COOLDOWN_KINDS.has(error.kind) && retryAfterMs > 0) {
      this.cooldowns.set(key, { until: clock.now() + retryAfterMs, error });
    }
    return this.fallback(stored, error);
  }

  /** Forgets back-off windows, e.g. when connectivity returns or the user asks to try again. */
  resetCooldowns(): void {
    this.cooldowns.clear();
  }

  /** Deletes expired and surplus records. Best effort. */
  async prune(): Promise<void> {
    const { store, namespace, policy, clock, logger } = this.options;
    try {
      const removed = await store.prune(namespace, {
        storedBefore: clock.now() - policy.maxStaleMs,
        maxEntries: policy.maxEntries,
      });
      if (removed > 0) logger.debug('Pruned cached data', { namespace, removed });
    } catch (cause) {
      logger.warn('Could not prune cached data', { namespace, cause });
    }
  }

  private fallback(stored: StoredValue<T> | null, error: AppError): Result<CachedValue<T>, AppError> {
    if (!stored || !FALLBACK_KINDS.has(error.kind)) return err(error);
    return ok({ value: stored.value, source: 'device', storedAt: stored.storedAt, refreshError: error.kind });
  }

  private async readStored(key: string, now: number): Promise<StoredValue<T> | null> {
    const { store, namespace, version, codec, policy, logger } = this.options;
    let record: CacheRecord | null;
    try {
      record = await store.read(namespace, key);
    } catch (cause) {
      logger.warn('Could not read cached data; using the network only', { namespace, cause });
      return null;
    }
    if (!record) return null;
    if (record.version !== version || record.storedAt > now || now - record.storedAt > policy.maxStaleMs) {
      // Another format, a clock that moved backwards, or simply too old to show.
      await this.removeStored(key);
      return null;
    }
    let decoded: { readonly value: T } | null = null;
    try {
      decoded = codec.decode(JSON.parse(record.payload));
    } catch {
      decoded = null;
    }
    if (decoded === null) {
      logger.warn('Discarded unreadable cached data', { namespace });
      await this.removeStored(key);
      return null;
    }
    return { value: decoded.value, storedAt: record.storedAt };
  }

  private async writeStored(key: string, value: T, storedAt: number): Promise<void> {
    const { store, namespace, version, codec, logger } = this.options;
    try {
      await store.write(namespace, key, { payload: JSON.stringify(codec.encode(value)), version, storedAt });
    } catch (cause) {
      logger.warn('Could not save data for offline use', { namespace, cause });
      return;
    }
    this.writesSincePrune += 1;
    if (this.writesSincePrune >= PRUNE_EVERY_WRITES) {
      this.writesSincePrune = 0;
      await this.prune();
    }
  }

  private async removeStored(key: string): Promise<void> {
    try {
      await this.options.store.remove(this.options.namespace, key);
    } catch (cause) {
      this.options.logger.warn('Could not remove cached data', { namespace: this.options.namespace, cause });
    }
  }
}

interface StoredValue<T> {
  readonly value: T;
  readonly storedAt: number;
}
