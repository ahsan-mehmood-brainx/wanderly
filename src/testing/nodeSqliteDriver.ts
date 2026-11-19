/// <reference types="node" />
import { type DatabaseSync } from 'node:sqlite';

import { type SqlParams } from '@/core/database/SqlDatabase';
import { type SqliteConnection, type SqliteDriver } from '@/core/database/SqliteDriver';

/** `node:sqlite` ships with Node 22.13+ (no flag). Loaded on use, so only tests that touch the database need it. */
function openMemoryDatabase(): DatabaseSync {
  const { DatabaseSync: Database } = process.getBuiltinModule('node:sqlite');
  return new Database(':memory:');
}

/** Rows come back with a null prototype; copy them so `toEqual` and spreading behave like device rows. */
const plain = <TRow>(row: unknown): TRow => ({ ...(row as object) }) as TRow;

/**
 * Real SQLite (Node's built-in engine) behind the same {@link SqliteConnection}
 * contract as expo-sqlite, so tests exercise actual SQL, constraints,
 * migrations and transactions rather than a hand-written fake.
 */
export class NodeSqliteConnection implements SqliteConnection {
  /** Statements run, for tests that check what reached the database. */
  readonly executed: string[] = [];
  /** When set, the next statement whose SQL contains this text throws (once). */
  failNextMatching: string | null = null;

  /** `ownsDb`: false when the engine is shared across reopen (an app restart), so closing keeps the data. */
  constructor(
    readonly db: DatabaseSync,
    private readonly ownsDb = true,
  ) {}

  private check(sql: string): void {
    this.executed.push(sql);
    if (this.failNextMatching !== null && sql.includes(this.failNextMatching)) {
      this.failNextMatching = null;
      throw new Error(`Injected failure for: ${sql}`);
    }
  }

  async exec(sql: string): Promise<void> {
    this.check(sql);
    this.db.exec(sql);
  }

  async run(sql: string, params: SqlParams = []) {
    this.check(sql);
    const result = this.db.prepare(sql).run(...params);
    return { changes: Number(result.changes) };
  }

  async getAll<TRow>(sql: string, params: SqlParams = []): Promise<TRow[]> {
    this.check(sql);
    return this.db
      .prepare(sql)
      .all(...params)
      .map((row) => plain<TRow>(row));
  }

  async getFirst<TRow>(sql: string, params: SqlParams = []): Promise<TRow | null> {
    this.check(sql);
    const row = this.db.prepare(sql).get(...params);
    return row === undefined ? null : plain<TRow>(row);
  }

  async close(): Promise<void> {
    if (this.ownsDb && this.db.isOpen) this.db.close();
  }
}

export interface NodeSqliteHandle {
  readonly driver: SqliteDriver;
  /** Every connection the driver opened, newest last. */
  readonly connections: NodeSqliteConnection[];
  /** Makes the next `open` calls fail. */
  failOpens: number;
}

/**
 * An in-memory database by default. Pass a shared `DatabaseSync` to keep data
 * across reopen (e.g. to simulate an app restart on the same file).
 */
export function nodeSqliteDriver(shared?: () => DatabaseSync): NodeSqliteHandle {
  const handle: NodeSqliteHandle = {
    connections: [],
    failOpens: 0,
    driver: async () => {
      if (handle.failOpens > 0) {
        handle.failOpens -= 1;
        throw new Error('Injected open failure');
      }
      const connection = shared
        ? new NodeSqliteConnection(shared(), false)
        : new NodeSqliteConnection(openMemoryDatabase());
      handle.connections.push(connection);
      return connection;
    },
  };
  return handle;
}

/** A raw in-memory engine, for tests that reopen the same data. */
export function createNodeSqliteEngine(): DatabaseSync {
  return openMemoryDatabase();
}
