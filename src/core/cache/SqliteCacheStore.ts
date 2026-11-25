import { type SqlDatabase } from '@/core/database/SqlDatabase';

import { type CacheNamespaceStats, type CacheRecord, type CacheStore } from './CacheStore';

interface CacheRow {
  readonly payload: unknown;
  readonly version: unknown;
  readonly stored_at: unknown;
}

interface StatsRow {
  readonly namespace: string;
  readonly entries: number;
  readonly bytes: number | null;
  readonly oldest: number | null;
  readonly newest: number | null;
}

/** {@link CacheStore} over the `cache_entries` table of the app database (migration 6). */
export class SqliteCacheStore implements CacheStore {
  constructor(private readonly database: SqlDatabase) {}

  async read(namespace: string, key: string): Promise<CacheRecord | null> {
    const row = await this.database.getFirst<CacheRow>(
      'SELECT payload, version, stored_at FROM cache_entries WHERE namespace = ? AND cache_key = ?',
      [namespace, key],
    );
    if (row === null) return null;
    // A row is untrusted like any stored data; a malformed one reads as missing.
    if (typeof row.payload !== 'string' || typeof row.version !== 'number' || typeof row.stored_at !== 'number') {
      return null;
    }
    return { payload: row.payload, version: row.version, storedAt: row.stored_at };
  }

  async write(namespace: string, key: string, record: CacheRecord): Promise<void> {
    await this.database.run(
      `INSERT INTO cache_entries (namespace, cache_key, version, payload, stored_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (namespace, cache_key) DO UPDATE SET
         version = excluded.version, payload = excluded.payload, stored_at = excluded.stored_at`,
      [namespace, key, record.version, record.payload, record.storedAt],
    );
  }

  async remove(namespace: string, key: string): Promise<void> {
    await this.database.run('DELETE FROM cache_entries WHERE namespace = ? AND cache_key = ?', [namespace, key]);
  }

  prune(namespace: string, { storedBefore, maxEntries }: { storedBefore: number; maxEntries: number }) {
    return this.database.transaction(async (tx) => {
      const expired = await tx.run('DELETE FROM cache_entries WHERE namespace = ? AND stored_at < ?', [
        namespace,
        storedBefore,
      ]);
      const overflow = await tx.run(
        `DELETE FROM cache_entries WHERE namespace = ? AND cache_key NOT IN (
           SELECT cache_key FROM cache_entries WHERE namespace = ? ORDER BY stored_at DESC, cache_key LIMIT ?)`,
        [namespace, namespace, Math.max(0, Math.floor(maxEntries))],
      );
      return expired.changes + overflow.changes;
    });
  }

  async stats(): Promise<readonly CacheNamespaceStats[]> {
    const rows = await this.database.getAll<StatsRow>(
      `SELECT namespace, COUNT(*) AS entries, SUM(length(payload)) AS bytes,
              MIN(stored_at) AS oldest, MAX(stored_at) AS newest
       FROM cache_entries GROUP BY namespace ORDER BY namespace`,
    );
    return rows.map((row) => ({
      namespace: row.namespace,
      entries: row.entries,
      bytes: row.bytes ?? 0,
      oldestStoredAt: row.oldest,
      newestStoredAt: row.newest,
    }));
  }

  async clear(): Promise<void> {
    await this.database.run('DELETE FROM cache_entries');
  }
}
