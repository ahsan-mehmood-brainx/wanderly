/** Values SQLite can bind and return for the column types the app uses (TEXT, INTEGER, REAL, NULL). */
export type SqlValue = string | number | null;

/** Positional parameters for `?` placeholders. Always bind user input; never interpolate it into SQL. */
export type SqlParams = readonly SqlValue[];

export interface SqlRunResult {
  /** Rows inserted, updated or deleted by the statement. */
  readonly changes: number;
}

/** Statements that read or write rows. */
export interface SqlExecutor {
  run(sql: string, params?: SqlParams): Promise<SqlRunResult>;
  getAll<TRow>(sql: string, params?: SqlParams): Promise<TRow[]>;
  getFirst<TRow>(sql: string, params?: SqlParams): Promise<TRow | null>;
}

/**
 * The app's on-device relational database (SQLite), already migrated to the
 * latest schema when the first statement runs.
 *
 * Statements run one at a time in the order they were issued, so a read never
 * sees half of another caller's transaction. Every method may throw (disk full,
 * corrupt file, failed migration); repositories catch and map to `AppError('storage')`.
 */
export interface SqlDatabase extends SqlExecutor {
  /**
   * Runs `task` in one transaction: committed when it resolves, rolled back when
   * it throws. Nothing else runs on the database meanwhile. Use only `tx` inside
   * `task`; calling the database itself from there would wait for the
   * transaction to finish, which never happens.
   */
  transaction<T>(task: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}
