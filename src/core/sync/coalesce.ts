import { type LocalChangeKind } from './LocalChange';
import { type PendingOperation, type PendingOperationKind } from './PendingOperation';

export type CoalesceOutcome =
  | { readonly action: 'write'; readonly kind: PendingOperationKind; readonly isNew: boolean }
  /** The operations cancel out: the remote never saw the entity and now never needs to. */
  | { readonly action: 'remove' };

/**
 * Folds a new local change into the entity's pending operation, so the outbox holds
 * one operation per entity however often it changes offline:
 *
 * | pending        | + create / update     | + delete                                   |
 * | -------------- | --------------------- | ------------------------------------------ |
 * | none           | upsert (new if create) | delete                                    |
 * | upsert (new)   | upsert (still new)    | removed: nothing to tell the remote        |
 * | upsert         | upsert                | delete                                     |
 * | delete         | upsert (not new)      | delete                                     |
 *
 * A new upsert that is being pushed right now is not removed by a delete: the push
 * may already have created it remotely, so the delete must follow it.
 */
export function coalesce(
  existing: Pick<PendingOperation, 'kind' | 'isNew' | 'status'> | null,
  change: LocalChangeKind,
): CoalesceOutcome {
  if (change === 'delete') {
    if (existing?.kind === 'upsert' && existing.isNew && existing.status !== 'inFlight') return { action: 'remove' };
    return { action: 'write', kind: 'delete', isNew: false };
  }
  if (!existing) return { action: 'write', kind: 'upsert', isNew: change === 'create' };
  return { action: 'write', kind: 'upsert', isNew: existing.kind === 'upsert' && existing.isNew };
}
