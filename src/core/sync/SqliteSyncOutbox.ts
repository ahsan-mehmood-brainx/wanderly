import { type SqlDatabase, type SqlExecutor } from '@/core/database/SqlDatabase';
import { APP_ERROR_KINDS, type AppErrorKind } from '@/core/errors/AppError';
import { type Observable, Subject } from '@/core/events/Subject';
import { type Logger } from '@/core/logging/Logger';
import { type Clock } from '@/core/utils/Clock';
import { type IdGenerator } from '@/core/utils/IdGenerator';

import { coalesce } from './coalesce';
import { type LocalChange, type LocalChangeLog } from './LocalChange';
import { type OutboxSummary, type PendingOperation, type PendingOperationStatus } from './PendingOperation';
import { type SyncOutbox } from './SyncOutbox';

const COLUMNS = `owner_id, entity_type, entity_id, kind, idempotency_key, is_new, status, attempts,
  next_attempt_at, last_error_kind, created_at, updated_at`;

interface OutboxRow {
  readonly owner_id: string;
  readonly entity_type: string;
  readonly entity_id: string;
  readonly kind: string;
  readonly idempotency_key: string;
  readonly is_new: number;
  readonly status: string;
  readonly attempts: number;
  readonly next_attempt_at: number;
  readonly last_error_kind: string | null;
  readonly created_at: number;
  readonly updated_at: number;
}

const isErrorKind = (value: string | null): value is AppErrorKind =>
  value !== null && (APP_ERROR_KINDS as readonly string[]).includes(value);

function toOperation(row: OutboxRow): PendingOperation | null {
  if (row.kind !== 'upsert' && row.kind !== 'delete') return null;
  if (row.status !== 'pending' && row.status !== 'inFlight' && row.status !== 'failed') return null;
  return {
    ownerId: row.owner_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    kind: row.kind,
    idempotencyKey: row.idempotency_key,
    isNew: row.is_new === 1,
    status: row.status as PendingOperationStatus,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    lastErrorKind: isErrorKind(row.last_error_kind) ? row.last_error_kind : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * The outbox in the app database (`sync_outbox`, migration 7). It is both the
 * write side used by repositories inside their transactions ({@link LocalChangeLog})
 * and the read/transition side used by the sync engine ({@link SyncOutbox}).
 */
export class SqliteSyncOutbox implements LocalChangeLog, SyncOutbox {
  private readonly recordedSubject: Subject<void>;

  constructor(
    private readonly database: SqlDatabase,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
    logger: Logger,
  ) {
    this.recordedSubject = new Subject((error) => logger.error('Outbox listener threw', error));
  }

  get recorded(): Observable<void> {
    return this.recordedSubject;
  }

  async record(tx: SqlExecutor, changes: LocalChange | readonly LocalChange[]): Promise<void> {
    const list: readonly LocalChange[] = Array.isArray(changes) ? changes : [changes as LocalChange];
    if (list.length === 0) return;
    const now = this.clock.now();
    for (const change of list) await this.recordOne(tx, change, now);
    this.recordedSubject.emit();
  }

  async summary(ownerId: string): Promise<OutboxSummary> {
    const rows = await this.database.getAll<{
      entity_type: string;
      status: string;
      count: number;
      oldest: number;
    }>(
      `SELECT entity_type, status, COUNT(*) AS count, MIN(created_at) AS oldest
       FROM sync_outbox WHERE owner_id = ? GROUP BY entity_type, status`,
      [ownerId],
    );
    const byEntityType: Record<string, number> = {};
    const totals = { pending: 0, inFlight: 0, failed: 0 };
    let oldestCreatedAt: number | null = null;
    for (const row of rows) {
      if (row.status === 'pending' || row.status === 'inFlight' || row.status === 'failed') {
        totals[row.status] += row.count;
      }
      byEntityType[row.entity_type] = (byEntityType[row.entity_type] ?? 0) + row.count;
      oldestCreatedAt = oldestCreatedAt === null ? row.oldest : Math.min(oldestCreatedAt, row.oldest);
    }
    return { ...totals, byEntityType, oldestCreatedAt };
  }

  async listDue(ownerId: string, now: number, limit: number): Promise<readonly PendingOperation[]> {
    const rows = await this.database.getAll<OutboxRow>(
      `SELECT ${COLUMNS} FROM sync_outbox
       WHERE owner_id = ? AND status = 'pending' AND next_attempt_at <= ?
       ORDER BY created_at, entity_type, entity_id LIMIT ?`,
      [ownerId, now, limit],
    );
    return rows.flatMap((row) => toOperation(row) ?? []);
  }

  async nextDueAt(ownerId: string): Promise<number | null> {
    const row = await this.database.getFirst<{ next: number | null }>(
      "SELECT MIN(next_attempt_at) AS next FROM sync_outbox WHERE owner_id = ? AND status = 'pending'",
      [ownerId],
    );
    return row?.next ?? null;
  }

  async claim(operation: PendingOperation, now: number): Promise<boolean> {
    const { changes } = await this.database.run(
      "UPDATE sync_outbox SET status = 'inFlight', updated_at = ? WHERE idempotency_key = ? AND status = 'pending'",
      [now, operation.idempotencyKey],
    );
    return changes > 0;
  }

  async acknowledge(operation: PendingOperation): Promise<void> {
    await this.database.transaction(async (tx) => {
      const { changes } = await tx.run('DELETE FROM sync_outbox WHERE idempotency_key = ?', [operation.idempotencyKey]);
      if (changes > 0) return;
      // Changed during the push: the newer operation stays, and the remote now knows the entity.
      await tx.run('UPDATE sync_outbox SET is_new = 0 WHERE owner_id = ? AND entity_type = ? AND entity_id = ?', [
        operation.ownerId,
        operation.entityType,
        operation.entityId,
      ]);
    });
  }

  async reschedule(
    operation: PendingOperation,
    nextAttemptAt: number,
    errorKind: AppErrorKind,
    countAttempt: boolean,
    now: number,
  ): Promise<void> {
    await this.database.run(
      `UPDATE sync_outbox SET status = 'pending', next_attempt_at = ?, last_error_kind = ?,
         attempts = attempts + ?, updated_at = ?
       WHERE idempotency_key = ?`,
      [nextAttemptAt, errorKind, countAttempt ? 1 : 0, now, operation.idempotencyKey],
    );
  }

  async markFailed(operation: PendingOperation, errorKind: AppErrorKind, now: number): Promise<void> {
    await this.database.run(
      `UPDATE sync_outbox SET status = 'failed', last_error_kind = ?, attempts = attempts + 1, updated_at = ?
       WHERE idempotency_key = ?`,
      [errorKind, now, operation.idempotencyKey],
    );
  }

  async retryFailed(ownerId: string, now: number): Promise<number> {
    const { changes } = await this.database.run(
      `UPDATE sync_outbox SET status = 'pending', attempts = 0, next_attempt_at = ?, last_error_kind = NULL,
         updated_at = ?
       WHERE owner_id = ? AND status = 'failed'`,
      [now, now, ownerId],
    );
    return changes;
  }

  async recoverInterrupted(now: number): Promise<number> {
    const { changes } = await this.database.run(
      "UPDATE sync_outbox SET status = 'pending', next_attempt_at = ?, updated_at = ? WHERE status = 'inFlight'",
      [now, now],
    );
    return changes;
  }

  private async recordOne(tx: SqlExecutor, change: LocalChange, now: number): Promise<void> {
    const existing = await tx.getFirst<OutboxRow>(
      `SELECT ${COLUMNS} FROM sync_outbox WHERE owner_id = ? AND entity_type = ? AND entity_id = ?`,
      [change.ownerId, change.entityType, change.entityId],
    );
    const current = existing ? toOperation(existing) : null;
    const outcome = coalesce(current, change.kind);

    if (outcome.action === 'remove') {
      await tx.run('DELETE FROM sync_outbox WHERE owner_id = ? AND entity_type = ? AND entity_id = ?', [
        change.ownerId,
        change.entityType,
        change.entityId,
      ]);
      return;
    }

    // Every version of a change gets its own key (see PendingOperation.idempotencyKey).
    const key = `${change.entityType}:${change.entityId}:${this.idGenerator()}`;
    await tx.run(
      `INSERT INTO sync_outbox (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?, NULL, ?, ?)
       ON CONFLICT (owner_id, entity_type, entity_id) DO UPDATE SET
         kind = excluded.kind, idempotency_key = excluded.idempotency_key, is_new = excluded.is_new,
         status = 'pending', attempts = 0, next_attempt_at = excluded.next_attempt_at, last_error_kind = NULL,
         updated_at = excluded.updated_at`,
      [
        change.ownerId,
        change.entityType,
        change.entityId,
        outcome.kind,
        key,
        outcome.isNew ? 1 : 0,
        now,
        current?.createdAt ?? now,
        now,
      ],
    );
  }
}
