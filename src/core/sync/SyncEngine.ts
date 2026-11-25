import { type AppError, type AppErrorKind, toAppError } from '@/core/errors/AppError';
import { type Observable, Subject } from '@/core/events/Subject';
import { type Logger } from '@/core/logging/Logger';
import { type ConnectivityService, isOfflineState } from '@/core/network/ConnectivityService';
import { type Clock } from '@/core/utils/Clock';

import { type LocalChangeLog } from './LocalChange';
import { type PendingOperation } from './PendingOperation';
import { type SyncEntitySources, type SyncGateway } from './SyncGateway';
import { type SyncOutbox } from './SyncOutbox';
import { type SyncRetryPolicy } from './SyncRetryPolicy';

/**
 * - `localOnly`: no backend; changes are tracked on the device only.
 * - `idle`: nothing due (or everything pushed).
 * - `syncing`: pushing now.
 * - `waitingForConnection`: changes are waiting for the device to come back online.
 * - `signedOut`: nobody to sync for.
 * - `error`: the outbox couldn't be read (database unavailable).
 */
export type SyncPhase = 'localOnly' | 'idle' | 'syncing' | 'waitingForConnection' | 'signedOut' | 'error';

export interface SyncStatus {
  readonly phase: SyncPhase;
  readonly mode: SyncGateway['mode'];
  readonly pending: number;
  readonly failed: number;
  readonly byEntityType: Readonly<Record<string, number>>;
  readonly lastSyncedAt: number | null;
  readonly lastErrorKind: AppErrorKind | null;
}

export interface SyncEngineDependencies {
  readonly outbox: SyncOutbox;
  readonly changeLog: Pick<LocalChangeLog, 'recorded'>;
  readonly gateway: SyncGateway;
  readonly sources: SyncEntitySources;
  readonly connectivity: Pick<ConnectivityService, 'subscribe' | 'isOffline'>;
  readonly currentOwnerId: () => string | null;
  readonly clock: Clock;
  readonly retryPolicy: SyncRetryPolicy;
  readonly logger: Logger;
  /** Operations pushed per database read. */
  readonly batchSize?: number;
  /** Wait after a local change before syncing, so a burst of edits is one run. */
  readonly debounceMs?: number;
}

const MAX_BATCHES_PER_RUN = 50;
/**
 * After a push failed as offline while the device looked online (captive portal,
 * dropped connection not yet reported), wait this long or for the next "online"
 * event before trying again, so the engine doesn't spin.
 */
export const OFFLINE_PAUSE_MS = 30_000;

/**
 * Pushes pending operations through the {@link SyncGateway}, one at a time, oldest first.
 *
 * - **Triggers:** `start()`, a local change (debounced), the device coming back
 *   online, the next retry falling due, and `sync()` / `retryFailed()` from the UI.
 * - **Single flight:** a trigger during a run doesn't start a second run; one more
 *   run follows the current one, so nothing is pushed twice concurrently.
 * - **Connection lost mid-request:** an `offline` or `cancelled` result puts the
 *   operation back without counting an attempt and pauses until the device reports
 *   being online again (or `OFFLINE_PAUSE_MS`, if no such event comes).
 * - **Retries:** other failures go through the retry policy (backoff, `Retry-After`);
 *   non-retryable ones and exhausted retries are marked `failed` and kept.
 * - **Interruptions:** operations left `inFlight` (a killed app, or a step that threw
 *   after `claim`) are reset to `pending` at the start of every run; their
 *   idempotency key makes a resend safe.
 * - **Obsolete upserts:** an upsert whose entity no longer exists is dropped (its
 *   delete, or its parent's delete, is pushed instead).
 */
export class SyncEngine {
  private status: SyncStatus;
  private readonly changes: Subject<SyncStatus>;
  private running: Promise<void> | null = null;
  private rerunRequested = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private stopListening: (() => void) | null = null;
  private pausedUntil = 0;

  constructor(private readonly deps: SyncEngineDependencies) {
    this.changes = new Subject((error) => deps.logger.error('Sync status listener threw', error));
    this.status = {
      phase: deps.gateway.mode === 'localOnly' ? 'localOnly' : 'idle',
      mode: deps.gateway.mode,
      pending: 0,
      failed: 0,
      byEntityType: {},
      lastSyncedAt: null,
      lastErrorKind: null,
    };
  }

  readonly getSnapshot = (): SyncStatus => this.status;

  readonly subscribe: Observable<SyncStatus>['subscribe'] = (listener) => this.changes.subscribe(listener);

  /** Begins listening for triggers and runs once. Returns a function that stops it. */
  start(): () => void {
    this.stopListening?.();
    const offConnectivity = this.deps.connectivity.subscribe((state) => {
      if (isOfflineState(state)) return;
      this.pausedUntil = 0;
      void this.sync();
    });
    const offChanges = this.deps.changeLog.recorded.subscribe(() => this.scheduleDebounced());
    this.stopListening = () => {
      offConnectivity();
      offChanges();
    };
    void this.sync();
    return () => this.stop();
  }

  stop(): void {
    this.stopListening?.();
    this.stopListening = null;
    this.clearTimers();
  }

  /** Runs now, or once more after the current run. Resolves when the outbox has been processed. */
  sync(): Promise<void> {
    if (this.running) {
      this.rerunRequested = true;
      return this.running;
    }
    this.running = (async () => {
      try {
        do {
          this.rerunRequested = false;
          await this.run();
        } while (this.rerunRequested);
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  /** Puts every failed operation back in the queue and syncs. */
  async retryFailed(): Promise<void> {
    const ownerId = this.deps.currentOwnerId();
    if (!ownerId) return;
    try {
      await this.deps.outbox.retryFailed(ownerId, this.deps.clock.now());
    } catch (cause) {
      this.deps.logger.error('Could not retry failed changes', { cause });
    }
    await this.sync();
  }

  private async run(): Promise<void> {
    const { outbox, gateway, connectivity, clock, logger } = this.deps;
    const ownerId = this.deps.currentOwnerId();
    if (!ownerId) {
      this.setStatus({ phase: 'signedOut', pending: 0, failed: 0, byEntityType: {} });
      return;
    }

    try {
      // Runs are single-flight, so nothing is legitimately in flight here: anything marked so was
      // interrupted (the app was killed, or a step after `claim` threw in an earlier run).
      const recovered = await outbox.recoverInterrupted(clock.now());
      if (recovered > 0) logger.info('Re-queued changes whose push was interrupted', { recovered });
      await this.refreshCounts(ownerId);
      if (gateway.mode === 'localOnly') {
        this.setStatus({ phase: 'localOnly' });
        return;
      }
      if (connectivity.isOffline() || clock.now() < this.pausedUntil) {
        this.setStatus({ phase: this.status.pending > 0 ? 'waitingForConnection' : 'idle' });
        return;
      }

      this.setStatus({ phase: 'syncing' });
      const paused = await this.drain(ownerId);
      await this.refreshCounts(ownerId);
      this.setStatus({ phase: paused && this.status.pending > 0 ? 'waitingForConnection' : 'idle' });
      if (paused) {
        this.pausedUntil = clock.now() + OFFLINE_PAUSE_MS;
        this.scheduleAt(this.pausedUntil);
      } else {
        await this.scheduleNextRetry(ownerId);
      }
    } catch (cause) {
      logger.error('Sync run failed', { cause });
      this.setStatus({ phase: 'error', lastErrorKind: 'storage' });
    }
  }

  /** Pushes everything due. Returns true when it paused because the connection went away. */
  private async drain(ownerId: string): Promise<boolean> {
    const { outbox, clock } = this.deps;
    const batchSize = this.deps.batchSize ?? 20;
    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
      const due = await outbox.listDue(ownerId, clock.now(), batchSize);
      if (due.length === 0) return false;
      for (const operation of due) {
        // Signed out (or another account signed in) mid-run: leave the rest for later.
        if (this.deps.currentOwnerId() !== ownerId) return false;
        if (!(await outbox.claim(operation, clock.now()))) continue;
        const outcome = await this.pushOne(operation);
        if (outcome === 'paused') return true;
      }
    }
    return false;
  }

  private async pushOne(operation: PendingOperation): Promise<'done' | 'paused'> {
    const { outbox, gateway, clock, logger, sources } = this.deps;

    let entity: unknown = null;
    if (operation.kind === 'upsert') {
      const load = sources[operation.entityType];
      if (!load) {
        await outbox.markFailed(operation, 'configuration', clock.now());
        logger.warn('No sync source for entity type', { entityType: operation.entityType });
        return 'done';
      }
      const loaded = await load(operation.ownerId, operation.entityId).catch((cause: unknown) => ({
        ok: false as const,
        error: toAppError(cause),
      }));
      if (!loaded.ok) return this.handleFailure(operation, loaded.error);
      if (loaded.value === null) {
        await outbox.acknowledge(operation);
        return 'done';
      }
      entity = loaded.value;
    }

    const pushed = await gateway.push({ operation, entity }).catch((cause: unknown) => ({
      ok: false as const,
      error: toAppError(cause),
    }));
    if (pushed.ok) {
      await outbox.acknowledge(operation);
      this.setStatus({ lastSyncedAt: clock.now(), lastErrorKind: null });
      return 'done';
    }
    return this.handleFailure(operation, pushed.error);
  }

  private async handleFailure(operation: PendingOperation, error: AppError): Promise<'done' | 'paused'> {
    const { outbox, clock, retryPolicy } = this.deps;
    const now = clock.now();
    this.setStatus({ lastErrorKind: error.kind });
    if (error.kind === 'offline' || error.kind === 'cancelled') {
      // The request never completed: not an attempt. Resume when the connection returns.
      await outbox.reschedule(operation, now, error.kind, false, now);
      return 'paused';
    }
    const decision = retryPolicy.decide(operation.attempts + 1, error);
    if (decision.retry) await outbox.reschedule(operation, now + decision.delayMs, error.kind, true, now);
    else await outbox.markFailed(operation, error.kind, now);
    return 'done';
  }

  private async refreshCounts(ownerId: string): Promise<void> {
    const summary = await this.deps.outbox.summary(ownerId);
    this.setStatus({
      pending: summary.pending + summary.inFlight,
      failed: summary.failed,
      byEntityType: summary.byEntityType,
    });
  }

  private async scheduleNextRetry(ownerId: string): Promise<void> {
    const next = await this.deps.outbox.nextDueAt(ownerId);
    if (next === null) {
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.retryTimer = null;
      return;
    }
    this.scheduleAt(next);
  }

  /** One timer at a time, only while started. */
  private scheduleAt(time: number): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (!this.stopListening) return;
    this.retryTimer = setTimeout(
      () => {
        this.retryTimer = null;
        void this.sync();
      },
      Math.max(0, time - this.deps.clock.now()),
    );
  }

  private scheduleDebounced(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.sync();
    }, this.deps.debounceMs ?? 1_000);
  }

  private clearTimers(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.retryTimer = null;
    this.debounceTimer = null;
  }

  private setStatus(patch: Partial<SyncStatus>): void {
    const next = { ...this.status, ...patch };
    const same = (Object.keys(patch) as (keyof SyncStatus)[]).every((key) =>
      key === 'byEntityType' ? sameCounts(next.byEntityType, this.status.byEntityType) : next[key] === this.status[key],
    );
    if (same) return;
    this.status = next;
    this.changes.emit(next);
  }
}

function sameCounts(a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}
