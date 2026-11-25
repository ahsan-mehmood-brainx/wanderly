import { AppError } from '@/core/errors/AppError';
import { err, type Result } from '@/core/result';

import { type PendingOperation } from './PendingOperation';

export interface SyncPush {
  readonly operation: PendingOperation;
  /** The entity as it is now, for an upsert; `null` for a delete. */
  readonly entity: unknown;
}

/**
 * Where pending operations would be pushed. Wanderly has no backend, so the app
 * uses {@link LocalOnlySyncGateway} and nothing leaves the device; the outbox,
 * retry policy and engine are ready for a cloud backend to implement this port.
 *
 * A remote implementation must:
 * - send `operation.idempotencyKey` (e.g. an `Idempotency-Key` header) and treat a
 *   key it has already applied as success;
 * - send `isNew` so the backend can tell a create from an update;
 * - answer a version conflict with a non-retryable error (see "Conflict resolution"
 *   in docs/ARCHITECTURE.md § 20) rather than overwrite newer data.
 */
export interface SyncGateway {
  readonly mode: 'localOnly' | 'remote';
  push(push: SyncPush, signal?: AbortSignal): Promise<Result<void, AppError>>;
}

/** No backend: data stays on this device. The engine never calls `push` in this mode. */
export class LocalOnlySyncGateway implements SyncGateway {
  readonly mode = 'localOnly' as const;

  async push(): Promise<Result<void, AppError>> {
    return err(new AppError('configuration', 'No sync backend is configured'));
  }
}

/** Reads an entity's current state for a push. `null` when it no longer exists. */
export type SyncEntityLoader = (ownerId: string, entityId: string) => Promise<Result<unknown, AppError>>;

export type SyncEntitySources = Readonly<Record<string, SyncEntityLoader>>;
