import { type Logger } from '@/core/logging/Logger';

import { migrate, type Migration } from './migrations';
import { type SqlDatabase, type SqlExecutor, type SqlParams, type SqlRunResult } from './SqlDatabase';
import { type SqliteConnection, type SqliteDriver } from './SqliteDriver';

export interface SqliteDatabaseOptions {
  readonly driver: SqliteDriver;
  readonly migrations: readonly Migration[];
  readonly logger: Logger;
}

/**
 * {@link SqlDatabase} over one SQLite connection.
 *
 * - **Lazy.** The file is opened and migrated on the first statement, so launch
 *   doesn't pay for it until a screen needs data.
 * - **Serialised.** Statements and transactions run strictly one after another.
 *   SQLite connections are shared, so without this a statement issued while a
 *   transaction is open would silently become part of it (and be rolled back with it).
 * - **Recoverable.** A failed open or migration is not cached: the next
 *   statement tries again (for example after the user frees disk space).
 */
export class SqliteDatabase implements SqlDatabase {
  private connection: Promise<SqliteConnection> | null = null;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: SqliteDatabaseOptions) {}

  run(sql: string, params: SqlParams = []): Promise<SqlRunResult> {
    return this.enqueue((connection) => connection.run(sql, params));
  }

  getAll<TRow>(sql: string, params: SqlParams = []): Promise<TRow[]> {
    return this.enqueue((connection) => connection.getAll<TRow>(sql, params));
  }

  getFirst<TRow>(sql: string, params: SqlParams = []): Promise<TRow | null> {
    return this.enqueue((connection) => connection.getFirst<TRow>(sql, params));
  }

  transaction<T>(task: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    return this.enqueue(async (connection) => {
      await connection.exec('BEGIN IMMEDIATE');
      let value: T;
      try {
        value = await task(connection);
      } catch (error) {
        await connection.exec('ROLLBACK').catch((cause: unknown) => {
          this.options.logger.error('Rollback failed', { cause });
        });
        throw error;
      }
      await connection.exec('COMMIT');
      return value;
    });
  }

  /** Closes the connection once queued work has finished. The next statement reopens it. */
  async close(): Promise<void> {
    const pending = this.connection;
    this.connection = null;
    await this.tail.catch(() => undefined);
    if (pending) await (await pending.catch(() => null))?.close();
  }

  private enqueue<T>(work: (connection: SqliteConnection) => Promise<T>): Promise<T> {
    const run = this.tail.then(async () => work(await this.open()));
    // The queue moves on whether this step succeeded or not.
    this.tail = run.catch(() => undefined);
    return run;
  }

  private open(): Promise<SqliteConnection> {
    if (!this.connection) {
      const opening = this.openAndMigrate();
      this.connection = opening;
      opening.catch((cause: unknown) => {
        this.options.logger.error('Could not open the local database', { cause });
        if (this.connection === opening) this.connection = null;
      });
    }
    return this.connection;
  }

  private async openAndMigrate(): Promise<SqliteConnection> {
    const connection = await this.options.driver();
    try {
      // Foreign keys are off by default in SQLite and apply per connection.
      await connection.exec('PRAGMA foreign_keys = ON');
      const report = await migrate(connection, this.options.migrations);
      if (report.from !== report.to) this.options.logger.info('Migrated the local database', { ...report });
      return connection;
    } catch (error) {
      await connection.close().catch(() => undefined);
      throw error;
    }
  }
}
