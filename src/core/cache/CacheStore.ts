/** One stored copy of remote data, as written by {@link PersistentCache}. */
export interface CacheRecord {
  /** JSON text. Untrusted when read back: the cache validates it with its codec. */
  readonly payload: string;
  /** Format version of the payload; a record of another version is discarded, never decoded. */
  readonly version: number;
  /** Epoch ms when the data was received from the network. */
  readonly storedAt: number;
}

export interface CacheNamespaceStats {
  readonly namespace: string;
  readonly entries: number;
  /** Total payload size in UTF-8 bytes (approximate: SQLite's `length` counts characters). */
  readonly bytes: number;
  readonly oldestStoredAt: number | null;
  readonly newestStoredAt: number | null;
}

/**
 * Durable key/value storage for copies of remote data (destinations, country
 * facts), kept apart from the traveller's own data: everything here can be
 * downloaded again, so it may be pruned or cleared at any time.
 *
 * Every method may throw (database unavailable, failed migration, disk full).
 * {@link PersistentCache} catches and degrades to network-only.
 */
export interface CacheStore {
  read(namespace: string, key: string): Promise<CacheRecord | null>;
  write(namespace: string, key: string, record: CacheRecord): Promise<void>;
  remove(namespace: string, key: string): Promise<void>;
  /** Deletes records stored before `storedBefore`, then the oldest beyond `maxEntries`. Returns how many went. */
  prune(namespace: string, options: { readonly storedBefore: number; readonly maxEntries: number }): Promise<number>;
  stats(): Promise<readonly CacheNamespaceStats[]>;
  /** Deletes every record (Settings › Offline & data › Clear saved information). */
  clear(): Promise<void>;
}
