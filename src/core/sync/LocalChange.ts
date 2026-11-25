import { type SqlExecutor } from '@/core/database/SqlDatabase';
import { type Observable } from '@/core/events/Subject';

export type LocalChangeKind = 'create' | 'update' | 'delete';

/**
 * One change the traveller made on this device. Only *which* record changed is
 * recorded, not its contents: a push reads the record as it is at that moment
 * (state-based sync), so several edits before a push send the latest state once.
 */
export interface LocalChange {
  readonly ownerId: string;
  /** Feature-defined, e.g. `trip`, `activity`, `expense`, `favorite`, `collection`. */
  readonly entityType: string;
  readonly entityId: string;
  readonly kind: LocalChangeKind;
}

/**
 * Records local changes as pending operations (transactional outbox). Repositories
 * call it with the transaction that writes the change, so the change and its
 * pending operation commit or roll back together: a saved trip is never missing
 * from the outbox, and the outbox never names a change that didn't happen.
 */
export interface LocalChangeLog {
  record(tx: SqlExecutor, changes: LocalChange | readonly LocalChange[]): Promise<void>;
  /** Emits after `record` ran (the transaction may still roll back; readers re-check the outbox). */
  readonly recorded: Observable<void>;
}

/** For repositories built without change tracking (tests of unrelated behaviour). */
export const NO_CHANGE_LOG: LocalChangeLog = {
  record: async () => undefined,
  recorded: { subscribe: () => () => undefined },
};
