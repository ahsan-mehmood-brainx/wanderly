import { createTestLogger } from '@/testing/testDependencies';
import { createNodeSqliteEngine, nodeSqliteDriver } from '@/testing/nodeSqliteDriver';

import { assertValidMigrations, DatabaseTooNewError, type Migration } from './migrations';
import { SqliteDatabase } from './SqliteDatabase';

const V1: Migration = {
  version: 1,
  name: 'notes',
  statements: ['CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL)'],
};
const V2: Migration = {
  version: 2,
  name: 'pinned',
  statements: ['ALTER TABLE notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0'],
};

function setup(migrations: readonly Migration[] = [V1], handle = nodeSqliteDriver()) {
  const logger = createTestLogger();
  return { handle, logger, db: new SqliteDatabase({ driver: handle.driver, migrations, logger }) };
}

const version = (engine: ReturnType<typeof createNodeSqliteEngine>) =>
  (engine.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;

describe('SqliteDatabase', () => {
  it('opens lazily, once, and migrates before the first statement', async () => {
    const { db, handle } = setup();
    expect(handle.connections).toHaveLength(0);

    await db.run('INSERT INTO notes (body) VALUES (?)', ['a']);
    await db.run('INSERT INTO notes (body) VALUES (?)', ['b']);

    expect(handle.connections).toHaveLength(1);
    await expect(db.getAll('SELECT body FROM notes ORDER BY id')).resolves.toEqual([{ body: 'a' }, { body: 'b' }]);
  });

  it('binds parameters, so input is never read as SQL', async () => {
    const { db } = setup();
    const hostile = "x'); DROP TABLE notes; --";
    await db.run('INSERT INTO notes (body) VALUES (?)', [hostile]);
    await expect(db.getFirst('SELECT body FROM notes')).resolves.toEqual({ body: hostile });
  });

  it('reports how many rows a statement changed, and null for no row', async () => {
    const { db } = setup();
    await expect(db.run('DELETE FROM notes')).resolves.toEqual({ changes: 0 });
    await expect(db.getFirst('SELECT body FROM notes')).resolves.toBeNull();
  });

  it('commits a transaction and returns its value', async () => {
    const { db } = setup();
    const value = await db.transaction(async (tx) => {
      await tx.run('INSERT INTO notes (body) VALUES (?)', ['kept']);
      return 42;
    });
    expect(value).toBe(42);
    await expect(db.getAll('SELECT body FROM notes')).resolves.toEqual([{ body: 'kept' }]);
  });

  it('rolls everything back when a transaction throws, and keeps working', async () => {
    const { db } = setup();
    await expect(
      db.transaction(async (tx) => {
        await tx.run('INSERT INTO notes (body) VALUES (?)', ['lost']);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    await expect(db.getAll('SELECT body FROM notes')).resolves.toEqual([]);
    await db.run('INSERT INTO notes (body) VALUES (?)', ['after']);
    await expect(db.getAll('SELECT body FROM notes')).resolves.toEqual([{ body: 'after' }]);
  });

  it('keeps statements issued during a transaction out of it', async () => {
    const { db } = setup();
    let outside: Promise<unknown> = Promise.resolve();
    await expect(
      db.transaction(async (tx) => {
        outside = db.run('INSERT INTO notes (body) VALUES (?)', ['outside']);
        await tx.run('INSERT INTO notes (body) VALUES (?)', ['inside']);
        throw new Error('roll back');
      }),
    ).rejects.toThrow('roll back');
    await outside;

    await expect(db.getAll('SELECT body FROM notes')).resolves.toEqual([{ body: 'outside' }]);
  });

  it('continues with queued work after a failed statement', async () => {
    const { db } = setup();
    const failing = db.run('INSERT INTO missing VALUES (1)');
    const next = db.run('INSERT INTO notes (body) VALUES (?)', ['ok']);
    await expect(failing).rejects.toThrow();
    await expect(next).resolves.toEqual({ changes: 1 });
  });

  it('retries opening after a failure instead of caching it', async () => {
    const { db, handle, logger } = setup();
    handle.failOpens = 1;
    await expect(db.getAll('SELECT * FROM notes')).rejects.toThrow('Injected open failure');
    expect(logger.error).toHaveBeenCalled();
    await expect(db.getAll('SELECT * FROM notes')).resolves.toEqual([]);
  });

  it('reopens after close, keeping data on the same file', async () => {
    const engine = createNodeSqliteEngine();
    const { db, handle } = setup(
      [V1],
      nodeSqliteDriver(() => engine),
    );
    await db.run('INSERT INTO notes (body) VALUES (?)', ['saved']);
    await db.close();

    await expect(db.getAll('SELECT body FROM notes')).resolves.toEqual([{ body: 'saved' }]);
    expect(handle.connections).toHaveLength(2);
  });
});

describe('migrations', () => {
  it('applies pending migrations in order and records the version', async () => {
    const engine = createNodeSqliteEngine();
    const { db } = setup(
      [V1, V2],
      nodeSqliteDriver(() => engine),
    );
    await db.run('INSERT INTO notes (body, pinned) VALUES (?, ?)', ['a', 1]);
    expect(version(engine)).toBe(2);
  });

  it('upgrades an existing database without losing rows or re-running old migrations', async () => {
    const engine = createNodeSqliteEngine();
    const first = setup(
      [V1],
      nodeSqliteDriver(() => engine),
    );
    await first.db.run('INSERT INTO notes (body) VALUES (?)', ['old']);
    await first.db.close();

    const second = setup(
      [V1, V2],
      nodeSqliteDriver(() => engine),
    );
    await expect(second.db.getAll('SELECT body, pinned FROM notes')).resolves.toEqual([{ body: 'old', pinned: 0 }]);
    expect(second.handle.connections[0]?.executed.some((sql) => sql.includes('CREATE TABLE'))).toBe(false);
    expect(version(engine)).toBe(2);
  });

  it('rolls back a failed migration entirely, stays at the last good version, and resumes later', async () => {
    const engine = createNodeSqliteEngine();
    const broken: Migration = {
      version: 2,
      name: 'broken',
      statements: ['CREATE TABLE half_done (id INTEGER)', 'THIS IS NOT SQL'],
    };
    const { db } = setup(
      [V1, broken],
      nodeSqliteDriver(() => engine),
    );

    await expect(db.getAll('SELECT * FROM notes')).rejects.toThrow('Migration 2 ("broken") failed');
    expect(version(engine)).toBe(1);
    expect(engine.prepare("SELECT name FROM sqlite_master WHERE name = 'half_done'").get()).toBeUndefined();

    const fixed = setup(
      [V1, V2],
      nodeSqliteDriver(() => engine),
    );
    await expect(fixed.db.getAll('SELECT pinned FROM notes')).resolves.toEqual([]);
    expect(version(engine)).toBe(2);
  });

  it('refuses a database written by a newer app version and leaves it untouched', async () => {
    const engine = createNodeSqliteEngine();
    engine.exec('PRAGMA user_version = 9');
    const { db } = setup(
      [V1],
      nodeSqliteDriver(() => engine),
    );

    await expect(db.getAll('SELECT 1')).rejects.toBeInstanceOf(DatabaseTooNewError);
    expect(version(engine)).toBe(9);
  });

  it.each([
    ['a gap', [V1, { ...V2, version: 3 }]],
    ['not starting at 1', [V2]],
    ['a duplicate', [V1, { ...V2, version: 1 }]],
    ['no statements', [{ ...V1, statements: [] }]],
  ])('rejects a migration list with %s', (_name, migrations) => {
    expect(() => assertValidMigrations(migrations)).toThrow();
  });
});
