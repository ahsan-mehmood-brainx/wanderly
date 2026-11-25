import { type Migration } from '@/core/database/migrations';

/**
 * Version 7: the outbox of local changes not yet pushed to a backend (none exists
 * yet; see `SyncGateway`). One row per owner and entity; no foreign keys, because a
 * pending delete must outlive the row it deletes.
 */
export const SYNC_MIGRATIONS: readonly Migration[] = [
  {
    version: 7,
    name: 'create sync_outbox',
    statements: [
      `CREATE TABLE sync_outbox (
        owner_id TEXT NOT NULL CHECK (length(owner_id) > 0),
        entity_type TEXT NOT NULL CHECK (length(entity_type) > 0),
        entity_id TEXT NOT NULL CHECK (length(entity_id) > 0),
        kind TEXT NOT NULL CHECK (kind IN ('upsert', 'delete')),
        idempotency_key TEXT NOT NULL UNIQUE CHECK (length(idempotency_key) > 0),
        is_new INTEGER NOT NULL CHECK (is_new IN (0, 1)),
        status TEXT NOT NULL CHECK (status IN ('pending', 'inFlight', 'failed')),
        attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        next_attempt_at INTEGER NOT NULL,
        last_error_kind TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (owner_id, entity_type, entity_id)
      ) WITHOUT ROWID`,
      'CREATE INDEX idx_sync_outbox_due ON sync_outbox (owner_id, status, next_attempt_at)',
    ],
  },
];
