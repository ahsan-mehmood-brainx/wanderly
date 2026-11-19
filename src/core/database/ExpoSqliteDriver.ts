import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { type SqlParams } from './SqlDatabase';
import { type SqliteConnection, type SqliteDriver } from './SqliteDriver';

/** Adapter: expo-sqlite's async API → {@link SqliteConnection}. */
class ExpoSqliteConnection implements SqliteConnection {
  constructor(private readonly db: SQLiteDatabase) {}

  exec(sql: string): Promise<void> {
    return this.db.execAsync(sql);
  }

  async run(sql: string, params: SqlParams = []) {
    const result = await this.db.runAsync(sql, [...params]);
    return { changes: result.changes };
  }

  getAll<TRow>(sql: string, params: SqlParams = []): Promise<TRow[]> {
    return this.db.getAllAsync<TRow>(sql, [...params]);
  }

  getFirst<TRow>(sql: string, params: SqlParams = []): Promise<TRow | null> {
    return this.db.getFirstAsync<TRow>(sql, [...params]);
  }

  close(): Promise<void> {
    return this.db.closeAsync();
  }
}

/**
 * The app database file in expo-sqlite's default directory (app-private
 * storage, included in the platform's device backup). `useNewConnection` keeps
 * this connection to ourselves, so nothing else can join our transactions.
 */
export function expoSqliteDriver(databaseName: string): SqliteDriver {
  return async () => {
    const db = await openDatabaseAsync(databaseName, { useNewConnection: true });
    // WAL lets reads proceed while a write commits and is the recommended mode for app databases.
    await db.execAsync('PRAGMA journal_mode = WAL');
    return new ExpoSqliteConnection(db);
  };
}
