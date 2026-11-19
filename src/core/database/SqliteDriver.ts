import { type SqlExecutor } from './SqlDatabase';

/**
 * One raw SQLite connection, as provided by the platform (expo-sqlite on
 * devices, `node:sqlite` in tests). It does no queuing or migrating of its own;
 * {@link SqliteDatabase} adds both on top.
 */
export interface SqliteConnection extends SqlExecutor {
  /** Runs one or more statements without parameters (DDL, PRAGMA, BEGIN/COMMIT). Never pass user input. */
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

/** Opens the connection. Called lazily, on the first statement, and again after a failed open. */
export type SqliteDriver = () => Promise<SqliteConnection>;
