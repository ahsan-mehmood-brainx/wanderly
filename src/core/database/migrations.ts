import { type SqliteConnection } from './SqliteDriver';

/**
 * One forward-only schema change. Versions are global to the database file and
 * start at 1, with no gaps: `PRAGMA user_version` records the last one applied.
 *
 * Never edit or reorder a migration that has shipped. Change the schema by
 * appending a new one, so every install, whatever version it starts from, ends
 * with the same schema.
 */
export interface Migration {
  readonly version: number;
  /** For logs, e.g. `create trips`. */
  readonly name: string;
  /** Run in order inside one transaction. Static SQL only (no user input). */
  readonly statements: readonly string[];
}

/** The database was written by a newer app version (the app was downgraded); opening it could lose data. */
export class DatabaseTooNewError extends Error {
  constructor(
    readonly databaseVersion: number,
    readonly latestKnownVersion: number,
  ) {
    super(`Database schema v${databaseVersion} is newer than this app supports (v${latestKnownVersion})`);
    this.name = 'DatabaseTooNewError';
  }
}

/** Throws when versions aren't exactly 1, 2, 3… in order, which would make `user_version` ambiguous. */
export function assertValidMigrations(migrations: readonly Migration[]): void {
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error(
        `Migration "${migration.name}" has version ${migration.version}; expected ${index + 1} (versions start at 1 with no gaps)`,
      );
    }
    if (migration.statements.length === 0) throw new Error(`Migration "${migration.name}" has no statements`);
  });
}

export async function readSchemaVersion(connection: SqliteConnection): Promise<number> {
  const row = await connection.getFirst<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

export interface MigrationReport {
  readonly from: number;
  readonly to: number;
}

/**
 * Brings the schema up to the latest migration. Each migration and its version
 * bump commit together, so a crash part-way leaves the database at the last
 * completed version and the next launch resumes from there.
 */
export async function migrate(
  connection: SqliteConnection,
  migrations: readonly Migration[],
): Promise<MigrationReport> {
  assertValidMigrations(migrations);
  const latest = migrations.length;
  const from = await readSchemaVersion(connection);
  if (from > latest) throw new DatabaseTooNewError(from, latest);

  for (const migration of migrations.slice(from)) {
    await connection.exec('BEGIN IMMEDIATE');
    try {
      for (const statement of migration.statements) await connection.exec(statement);
      // PRAGMA can't take bound parameters; the version is an integer we validated above.
      await connection.exec(`PRAGMA user_version = ${migration.version}`);
      await connection.exec('COMMIT');
    } catch (error) {
      await connection.exec('ROLLBACK').catch(() => undefined);
      throw new Error(`Migration ${migration.version} ("${migration.name}") failed`, { cause: error });
    }
  }
  return { from, to: latest };
}
