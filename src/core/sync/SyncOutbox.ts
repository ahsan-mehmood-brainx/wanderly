import { type AppErrorKind } from '@/core/errors/AppError';

import { type OutboxSummary, type PendingOperation } from './PendingOperation';

/**
 * Read and state-transition side of the outbox, used by the sync engine. Every
 * transition is keyed by the operation's idempotency key, so an operation that
 * changed meanwhile (the traveller edited the entity during a push) is never
 * overwritten by the outcome of pushing its older version.
 *
 * Methods may throw (database unavailable); the engine catches and reports.
 */
export interface SyncOutbox {
  summary(ownerId: string): Promise<OutboxSummary>;
  /** Pending operations due at `now`, oldest first. */
  listDue(ownerId: string, now: number, limit: number): Promise<readonly PendingOperation[]>;
  /** Earliest `nextAttemptAt` of a pending operation, or `null` when nothing is waiting. */
  nextDueAt(ownerId: string): Promise<number | null>;
  /** `pending` → `inFlight`. False if the operation changed or was claimed since it was listed. */
  claim(operation: PendingOperation, now: number): Promise<boolean>;
  /**
   * The push of this version succeeded: the operation is removed. If the entity
   * changed during the push, the newer operation stays and is no longer `isNew`.
   */
  acknowledge(operation: PendingOperation): Promise<void>;
  /** Back to `pending`, due at `nextAttemptAt`. `countAttempt` is false when the push never really happened (offline). */
  reschedule(
    operation: PendingOperation,
    nextAttemptAt: number,
    errorKind: AppErrorKind,
    countAttempt: boolean,
    now: number,
  ): Promise<void>;
  markFailed(operation: PendingOperation, errorKind: AppErrorKind, now: number): Promise<void>;
  /** Every `failed` operation of the owner back to `pending`, with attempts reset. Returns how many. */
  retryFailed(ownerId: string, now: number): Promise<number>;
  /** Every `inFlight` operation (of any owner) back to `pending`: their pushes were interrupted by a restart. */
  recoverInterrupted(now: number): Promise<number>;
}
