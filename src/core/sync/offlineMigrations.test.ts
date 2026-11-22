import { APP_MIGRATIONS } from '@/bootstrap/databaseMigrations';
import { PersistentCache } from '@/core/cache/PersistentCache';
import { SqliteCacheStore } from '@/core/cache/SqliteCacheStore';
import { SqliteDatabase } from '@/core/database/SqliteDatabase';
import { ok } from '@/core/result';
import { LocalTripRepository } from '@/features/trips/data/LocalTripRepository';
import { ManualClock, sequentialIds } from '@/testing/ManualClock';
import { createNodeSqliteEngine, type NodeSqliteConnection, nodeSqliteDriver } from '@/testing/nodeSqliteDriver';
import { createTestLogger } from '@/testing/testDependencies';
import { storedTrip, TRIP_OWNER } from '@/testing/tripFixtures';

import { SqliteSyncOutbox } from './SqliteSyncOutbox';

const VERSION_BEFORE_OFFLINE = 5;

function open(engine: ReturnType<typeof createNodeSqliteEngine>, migrations = APP_MIGRATIONS) {
  const handle = nodeSqliteDriver(() => engine);
  const logger = createTestLogger();
  const database = new SqliteDatabase({ driver: handle.driver, migrations, logger });
  const outbox = new SqliteSyncOutbox(database, new ManualClock(1), sequentialIds('op'), logger);
  return { handle, logger, database, outbox, trips: new LocalTripRepository(database, logger, outbox) };
}

describe('offline migrations (6: cache_entries, 7: sync_outbox)', () => {
  it('are versions 6 and 7, after photos', () => {
    expect(APP_MIGRATIONS.map(({ version }) => version)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(APP_MIGRATIONS[5]?.name).toMatch(/cache_entries/);
    expect(APP_MIGRATIONS[6]?.name).toMatch(/sync_outbox/);
  });

  it('upgrade a version 5 database and keep its trips, without inventing pending changes for them', async () => {
    const engine = createNodeSqliteEngine();
    // The previous app version: no outbox table, no change tracking.
    const old = open(engine, APP_MIGRATIONS.slice(0, VERSION_BEFORE_OFFLINE));
    expect((await new LocalTripRepository(old.database, old.logger).insert(TRIP_OWNER, storedTrip())).ok).toBe(true);
    await old.database.close();

    const upgraded = open(engine);
    expect(await upgraded.trips.list(TRIP_OWNER)).toEqual(ok([storedTrip()]));
    await expect(upgraded.database.getFirst('PRAGMA user_version')).resolves.toEqual({ user_version: 7 });
    // Trips saved before the outbox existed are not back-filled as pending changes.
    expect((await upgraded.outbox.summary(TRIP_OWNER)).pending).toBe(0);
  });

  it('a failed migration leaves the last good version, fails storage safely, and is retried on the next statement', async () => {
    const engine = createNodeSqliteEngine();
    const { handle, database, trips } = open(engine);
    let failNext = true;
    const realDriver = handle.driver;
    // Inject the failure on the connection that runs the migration.
    const failing = new SqliteDatabase({
      driver: async () => {
        const connection = (await realDriver()) as NodeSqliteConnection;
        if (failNext) {
          connection.failNextMatching = 'CREATE TABLE sync_outbox';
          failNext = false;
        }
        return connection;
      },
      migrations: APP_MIGRATIONS,
      logger: createTestLogger(),
    });
    const failingTrips = new LocalTripRepository(failing, createTestLogger());

    const first = await failingTrips.insert(TRIP_OWNER, storedTrip());
    expect(!first.ok && first.error.kind).toBe('storage');
    await database.close();
    const raw = engine.prepare('PRAGMA user_version').get() as { user_version: number };
    expect(raw.user_version).toBe(6);

    // The device cache degrades to network-only meanwhile instead of failing loads.
    const cache = new PersistentCache({
      store: new SqliteCacheStore(
        new SqliteDatabase({
          driver: async () => Promise.reject(new Error('down')),
          migrations: APP_MIGRATIONS,
          logger: createTestLogger(),
        }),
      ),
      namespace: 'test',
      version: 1,
      codec: {
        encode: (value: string) => value,
        decode: (raw: unknown) => (typeof raw === 'string' ? { value: raw } : null),
      },
      policy: { freshForMs: 1, maxStaleMs: 2, maxEntries: 1 },
      clock: new ManualClock(),
      logger: createTestLogger(),
    });
    expect((await cache.get('k', async () => ok('fresh'))).ok).toBe(true);

    // Next statement: the migration runs again and succeeds.
    const second = await failingTrips.insert(TRIP_OWNER, storedTrip());
    expect(second.ok).toBe(true);
    expect(await trips.list(TRIP_OWNER)).toEqual(ok([storedTrip()]));
  });
});
