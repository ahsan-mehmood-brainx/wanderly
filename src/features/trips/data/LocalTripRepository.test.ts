import { APP_MIGRATIONS } from '@/bootstrap/databaseMigrations';
import { SqliteDatabase } from '@/core/database/SqliteDatabase';
import { createNodeSqliteEngine, nodeSqliteDriver } from '@/testing/nodeSqliteDriver';
import { createTestLogger } from '@/testing/testDependencies';
import { createTripStorage, OTHER_TRIP_OWNER, storedTrip, TRIP_OWNER } from '@/testing/tripFixtures';

import { LocalTripRepository } from './LocalTripRepository';

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!result.ok) throw result.error;
  return result.value;
};

describe('LocalTripRepository', () => {
  it('stores and reads back every field', async () => {
    const { repository } = createTripStorage();
    const trip = storedTrip({
      title: 'Ünï "quoted" \'trip\'; DROP TABLE trips',
      description: 'Line one\nLine two',
      coverImage: 'trip-covers/a.jpg',
      cancelledAt: 123,
      budget: 9_007_199_254,
      currency: 'JPY',
    });
    expect(await repository.insert(TRIP_OWNER, trip)).toEqual({ ok: true, value: undefined });
    expect(unwrap(await repository.findById(TRIP_OWNER, trip.id))).toEqual(trip);
  });

  it('returns null for an unknown id', async () => {
    const { repository } = createTripStorage();
    expect(unwrap(await repository.findById(TRIP_OWNER, 'nope'))).toBeNull();
  });

  it('lists trips by start date', async () => {
    const { repository } = createTripStorage();
    await repository.insert(TRIP_OWNER, storedTrip({ id: 'b', startDate: '2027-08-01', endDate: '2027-08-02' }));
    await repository.insert(TRIP_OWNER, storedTrip({ id: 'a', startDate: '2027-07-01', endDate: '2027-07-02' }));
    expect(unwrap(await repository.list(TRIP_OWNER)).map(({ id }) => id)).toEqual(['a', 'b']);
  });

  it('updates all editable fields but not the id or createdAt', async () => {
    const { repository } = createTripStorage();
    const trip = storedTrip({ createdAt: 1 });
    await repository.insert(TRIP_OWNER, trip);
    const changed = { ...trip, title: 'New', budget: 1, currency: 'EUR', cancelledAt: 7, updatedAt: 99, createdAt: 50 };
    expect((await repository.update(TRIP_OWNER, changed)).ok).toBe(true);
    expect(unwrap(await repository.findById(TRIP_OWNER, trip.id))).toEqual({ ...changed, createdAt: 1 });
  });

  it('deletes a trip', async () => {
    const { repository } = createTripStorage();
    await repository.insert(TRIP_OWNER, storedTrip());
    expect((await repository.delete(TRIP_OWNER, 'trip-1')).ok).toBe(true);
    expect(unwrap(await repository.list(TRIP_OWNER))).toEqual([]);
  });

  it.each(['update', 'delete'] as const)('%s of a missing trip is notFound', async (operation) => {
    const { repository } = createTripStorage();
    const result =
      operation === 'update'
        ? await repository.update(TRIP_OWNER, storedTrip())
        : await repository.delete(TRIP_OWNER, 'trip-1');
    expect(!result.ok && result.error.kind).toBe('notFound');
  });

  describe('findOverlapping', () => {
    const range = { startDate: '2027-07-10', endDate: '2027-07-15' };

    async function ids(trips: Parameters<typeof storedTrip>[0][], excludeId: string | null = null) {
      const { repository } = createTripStorage();
      for (const [index, trip] of trips.entries())
        await repository.insert(TRIP_OWNER, storedTrip({ id: `t${index}`, ...trip }));
      return unwrap(await repository.findOverlapping(TRIP_OWNER, range, excludeId)).map(({ id }) => id);
    }

    it('finds overlaps, earliest first', async () => {
      await expect(
        ids([
          { startDate: '2027-07-14', endDate: '2027-07-20' },
          { startDate: '2027-07-01', endDate: '2027-07-11' },
        ]),
      ).resolves.toEqual(['t1', 't0']);
    });

    it('allows trips that only touch', async () => {
      await expect(
        ids([
          { startDate: '2027-07-05', endDate: '2027-07-10' },
          { startDate: '2027-07-15', endDate: '2027-07-20' },
        ]),
      ).resolves.toEqual([]);
    });

    it('skips cancelled trips and the excluded trip', async () => {
      await expect(ids([{ startDate: '2027-07-11', endDate: '2027-07-12', cancelledAt: 1 }])).resolves.toEqual([]);
      await expect(ids([{ startDate: '2027-07-11', endDate: '2027-07-12' }], 't0')).resolves.toEqual([]);
    });
  });

  describe('schema', () => {
    it.each([
      ['an end before the start', { startDate: '2027-07-05', endDate: '2027-07-01' }],
      ['an empty title', { title: '' }],
      ['a zero budget', { budget: 0 }],
      ['a bad currency', { currency: 'DOLLAR' }],
    ])('rejects %s even if validation were bypassed', async (_name, overrides) => {
      const { repository } = createTripStorage();
      const result = await repository.insert(TRIP_OWNER, storedTrip(overrides));
      expect(!result.ok && result.error.kind).toBe('storage');
    });

    it('rejects a duplicate id', async () => {
      const { repository } = createTripStorage();
      await repository.insert(TRIP_OWNER, storedTrip());
      expect((await repository.insert(TRIP_OWNER, storedTrip())).ok).toBe(false);
    });

    it('creates the owner and date index', async () => {
      const { database } = createTripStorage();
      await expect(
        database.getFirst("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_trips_owner_dates'"),
      ).resolves.toEqual({ name: 'idx_trips_owner_dates' });
    });

    it('rejects a trip without an owner', async () => {
      const { repository } = createTripStorage();
      const result = await repository.insert('', storedTrip());
      expect(!result.ok && result.error.kind).toBe('storage');
    });
  });

  describe('separation between accounts', () => {
    async function twoAccounts() {
      const storage = createTripStorage();
      await storage.repository.insert(TRIP_OWNER, storedTrip({ id: 'mine', title: 'Mine' }));
      await storage.repository.insert(OTHER_TRIP_OWNER, storedTrip({ id: 'theirs', title: 'Theirs' }));
      return storage;
    }

    it("lists and finds only the owner's trips", async () => {
      const { repository } = await twoAccounts();
      expect(unwrap(await repository.list(TRIP_OWNER)).map(({ id }) => id)).toEqual(['mine']);
      expect(unwrap(await repository.list(OTHER_TRIP_OWNER)).map(({ id }) => id)).toEqual(['theirs']);
      expect(unwrap(await repository.findById(TRIP_OWNER, 'theirs'))).toBeNull();
    });

    it("checks overlaps only against the owner's trips", async () => {
      const { repository } = await twoAccounts();
      const range = { startDate: '2027-07-02', endDate: '2027-07-03' };
      expect(unwrap(await repository.findOverlapping(TRIP_OWNER, range, null)).map(({ id }) => id)).toEqual(['mine']);
    });

    it("treats another account's trip as missing and leaves it unchanged", async () => {
      const { repository } = await twoAccounts();
      const theirs = storedTrip({ id: 'theirs', title: 'Theirs' });

      const updated = await repository.update(TRIP_OWNER, { ...theirs, title: 'Taken' });
      const deleted = await repository.delete(TRIP_OWNER, 'theirs');

      expect(!updated.ok && updated.error.kind).toBe('notFound');
      expect(!deleted.ok && deleted.error.kind).toBe('notFound');
      expect(unwrap(await repository.findById(OTHER_TRIP_OWNER, 'theirs'))).toEqual(theirs);
    });
  });

  it('keeps trips across an app restart', async () => {
    const engine = createNodeSqliteEngine();
    const logger = createTestLogger();
    const open = () =>
      new SqliteDatabase({ driver: nodeSqliteDriver(() => engine).driver, migrations: APP_MIGRATIONS, logger });

    const first = open();
    await new LocalTripRepository(first, logger).insert(TRIP_OWNER, storedTrip());
    await first.close();

    expect(unwrap(await new LocalTripRepository(open(), logger).list(TRIP_OWNER))).toHaveLength(1);
  });

  it('skips a corrupt row, logs it, and still returns the rest', async () => {
    const { repository, database, logger } = createTripStorage();
    await repository.insert(TRIP_OWNER, storedTrip({ id: 'good' }));
    await repository.insert(TRIP_OWNER, storedTrip({ id: 'bad', startDate: '2027-09-01', endDate: '2027-09-02' }));
    await database.run("UPDATE trips SET start_date = 'garbage', end_date = 'garbage!' WHERE id = 'bad'");

    expect(unwrap(await repository.list(TRIP_OWNER)).map(({ id }) => id)).toEqual(['good']);
    expect(unwrap(await repository.findById(TRIP_OWNER, 'bad'))).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith('Skipped unreadable trips', { skipped: 1 });
  });

  it('turns database failures into storage errors instead of throwing', async () => {
    const { repository, handle } = createTripStorage();
    handle.failOpens = 1;
    const result = await repository.list(TRIP_OWNER);
    expect(!result.ok && result.error.kind).toBe('storage');
    expect((await repository.list(TRIP_OWNER)).ok).toBe(true);
  });
});
