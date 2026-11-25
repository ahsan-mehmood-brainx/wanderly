import { type AppErrorKind } from '@/core/errors/AppError';

export type PendingOperationKind = 'upsert' | 'delete';

/**
 * - `pending`: waiting to be pushed (now, or at `nextAttemptAt` after a failure).
 * - `inFlight`: being pushed. Reset to `pending` at start-up, because a push the app
 *   was killed during may or may not have arrived; the idempotency key makes resending safe.
 * - `failed`: gave up (non-retryable error or too many attempts). Kept until the
 *   traveller retries it, so nothing is dropped silently.
 */
export type PendingOperationStatus = 'pending' | 'inFlight' | 'failed';

/** One entity's not-yet-pushed change. There is at most one per owner, entity type and id. */
export interface PendingOperation {
  readonly ownerId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly kind: PendingOperationKind;
  /**
   * Unique per version of the change, and reused by every attempt to push that version.
   * A backend that remembers keys applies a retried push once, however often it arrives.
   * A newer local change gets a new key, so it is never mistaken for a duplicate.
   */
  readonly idempotencyKey: string;
  /** The entity was created since the last successful push, so the remote has never seen it. */
  readonly isNew: boolean;
  readonly status: PendingOperationStatus;
  readonly attempts: number;
  readonly nextAttemptAt: number;
  readonly lastErrorKind: AppErrorKind | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface OutboxSummary {
  readonly pending: number;
  readonly inFlight: number;
  readonly failed: number;
  /** Pending, in-flight and failed operations per entity type. */
  readonly byEntityType: Readonly<Record<string, number>>;
  readonly oldestCreatedAt: number | null;
}

export const EMPTY_OUTBOX_SUMMARY: OutboxSummary = {
  pending: 0,
  inFlight: 0,
  failed: 0,
  byEntityType: {},
  oldestCreatedAt: null,
};
