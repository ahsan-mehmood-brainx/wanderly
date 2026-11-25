import { type Migration } from '@/core/database/migrations';

/**
 * Version 6: durable copies of remote data for offline use. Shared by every
 * account (the data is public, like `exchange_rates`), and separate from the
 * traveller's own tables so it can be pruned or cleared without touching them.
 */
export const CACHE_MIGRATIONS: readonly Migration[] = [
  {
    version: 6,
    name: 'create cache_entries',
    statements: [
      `CREATE TABLE cache_entries (
        namespace TEXT NOT NULL CHECK (length(namespace) > 0),
        cache_key TEXT NOT NULL,
        version INTEGER NOT NULL CHECK (version >= 1),
        payload TEXT NOT NULL,
        stored_at INTEGER NOT NULL,
        PRIMARY KEY (namespace, cache_key)
      ) WITHOUT ROWID`,
      'CREATE INDEX idx_cache_entries_age ON cache_entries (namespace, stored_at)',
    ],
  },
];
