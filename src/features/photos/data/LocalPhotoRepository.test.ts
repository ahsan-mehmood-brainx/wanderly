import { APP_MIGRATIONS } from '@/bootstrap/databaseMigrations';
import { SqliteDatabase } from '@/core/database/SqliteDatabase';
import { type SqlParams } from '@/core/database/SqlDatabase';
import { LocalExpenseRepository } from '@/features/budget/data/LocalExpenseRepository';
import { LocalActivityRepository } from '@/features/itinerary/data/LocalActivityRepository';
import { LocalTripRepository } from '@/features/trips/data/LocalTripRepository';
import { expense } from '@/testing/budgetFixtures';
import { activity } from '@/testing/itineraryFixtures';
import { createNodeSqliteEngine, nodeSqliteDriver } from '@/testing/nodeSqliteDriver';
import { createPhotoStorage, photo, PHOTO_ACTIVITY, PHOTOS_TRIP, seededPhotoDatabase } from '@/testing/photoFixtures';
import { createTestLogger } from '@/testing/testDependencies';
import { OTHER_TRIP_OWNER, storedTrip, TRIP_OWNER } from '@/testing/tripFixtures';

import { type Photo } from '../domain/Photo';
import { MAX_PHOTOS_PER_TRIP } from '../domain/imageValidation';
import { LocalPhotoRepository } from './LocalPhotoRepository';

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!result.ok) throw result.error;
  return result.value;
};

const tripIds = async (repository: LocalPhotoRepository, tripId = 'trip-1', ownerId = TRIP_OWNER) =>
  unwrap(await repository.listByTrip(ownerId, tripId)).map(({ id }) => id);

describe('LocalPhotoRepository', () => {
  it('stores and reads back every field of a photo', async () => {
    const { photoRepository } = await seededPhotoDatabase();
    const item = photo({
      id: 'p-1',
      activityId: 'act-1',
      reference: 'trip-photos/p-1.jpg',
      width: 1536,
      height: 2048,
      fileSize: 734_211,
      source: 'camera',
      takenAt: Date.UTC(2027, 6, 2, 8, 15, 30),
      createdAt: 123,
    });

    expect(await photoRepository.insertMany(TRIP_OWNER, [item])).toEqual({ ok: true, value: undefined });
    expect(unwrap(await photoRepository.findById(TRIP_OWNER, 'p-1'))).toEqual(item);
  });

  it('keeps a photo without a taken date', async () => {
    const { photoRepository } = await seededPhotoDatabase();
    await photoRepository.insertMany(TRIP_OWNER, [photo({ takenAt: null })]);
    expect(unwrap(await photoRepository.findById(TRIP_OWNER, 'photo-1'))?.takenAt).toBeNull();
  });

  it('returns null for an unknown id', async () => {
    const { photoRepository } = await seededPhotoDatabase();
    expect(unwrap(await photoRepository.findById(TRIP_OWNER, 'nope'))).toBeNull();
  });

  it("lists the trip's photos, its activities' included, newest first", async () => {
    const trip2 = storedTrip({ id: 'trip-2', startDate: '2027-09-01', endDate: '2027-09-03' });
    const { photoRepository } = await seededPhotoDatabase(
      [PHOTOS_TRIP, trip2],
      [PHOTO_ACTIVITY],
      [
        photo({ id: 'old', reference: 'trip-photos/old.jpg', createdAt: 1 }),
        photo({ id: 'activity', reference: 'trip-photos/act.jpg', activityId: 'act-1', createdAt: 3 }),
        photo({ id: 'mid', reference: 'trip-photos/mid.jpg', createdAt: 2 }),
        photo({ id: 'other-trip', tripId: 'trip-2', reference: 'trip-photos/other.jpg', createdAt: 9 }),
      ],
    );

    await expect(tripIds(photoRepository)).resolves.toEqual(['activity', 'mid', 'old']);
    expect(unwrap(await photoRepository.listByActivity(TRIP_OWNER, 'act-1')).map(({ id }) => id)).toEqual(['activity']);
    expect(unwrap(await photoRepository.countByTrip(TRIP_OWNER, 'trip-1'))).toBe(3);
    expect(unwrap(await photoRepository.countByTrip(TRIP_OWNER, 'trip-2'))).toBe(1);
  });

  it('deletes a photo, and a missing one is notFound', async () => {
    const { photoRepository } = await seededPhotoDatabase(undefined, undefined, [
      photo({ id: 'a', reference: 'trip-photos/a.jpg' }),
      photo({ id: 'b', reference: 'trip-photos/b.jpg' }),
    ]);

    expect((await photoRepository.delete(TRIP_OWNER, 'a')).ok).toBe(true);
    await expect(tripIds(photoRepository)).resolves.toEqual(['b']);
    const missing = await photoRepository.delete(TRIP_OWNER, 'a');
    expect(!missing.ok && missing.error.kind).toBe('notFound');
  });

  it("lists every account's references for file cleanup", async () => {
    const storage = await seededPhotoDatabase(undefined, undefined, [photo({ reference: 'trip-photos/mine.jpg' })]);
    await storage.tripRepository.insert(OTHER_TRIP_OWNER, storedTrip({ id: 'their-trip' }));
    await storage.photoRepository.insertMany(OTHER_TRIP_OWNER, [
      photo({ id: 'theirs', tripId: 'their-trip', reference: 'trip-photos/theirs.jpg' }),
    ]);

    expect([...unwrap(await storage.photoRepository.allReferences())].sort()).toEqual([
      'trip-photos/mine.jpg',
      'trip-photos/theirs.jpg',
    ]);
  });

  describe('insertMany', () => {
    it('saves several photos at once', async () => {
      const { photoRepository } = await seededPhotoDatabase();
      const result = await photoRepository.insertMany(TRIP_OWNER, [
        photo({ id: 'a', reference: 'trip-photos/a.jpg', createdAt: 1 }),
        photo({ id: 'b', reference: 'trip-photos/b.jpg', createdAt: 2 }),
      ]);
      expect(result.ok).toBe(true);
      await expect(tripIds(photoRepository)).resolves.toEqual(['b', 'a']);
    });

    it('saves nothing when one of the photos is invalid', async () => {
      const { photoRepository } = await seededPhotoDatabase();
      const result = await photoRepository.insertMany(TRIP_OWNER, [
        photo({ id: 'a', reference: 'trip-photos/a.jpg' }),
        photo({ id: 'b', reference: 'trip-photos/b.jpg', width: 0 }),
      ]);
      expect(!result.ok && result.error.kind).toBe('storage');
      await expect(tripIds(photoRepository)).resolves.toEqual([]);
    });

    it('rolls every insert back when a write fails part-way', async () => {
      const { photoRepository, handle } = await seededPhotoDatabase();
      const connection = handle.connections[0];
      if (!connection) throw new Error('database not opened');
      const run = connection.run.bind(connection);
      jest.spyOn(connection, 'run').mockImplementation(async (sql: string, params: SqlParams = []) => {
        if (/INSERT\s+INTO\s+photos/i.test(sql) && params.includes('b')) throw new Error('disk full');
        return run(sql, params);
      });

      const result = await photoRepository.insertMany(TRIP_OWNER, [
        photo({ id: 'a', reference: 'trip-photos/a.jpg' }),
        photo({ id: 'b', reference: 'trip-photos/b.jpg' }),
      ]);

      expect(!result.ok && result.error.kind).toBe('storage');
      jest.mocked(connection.run).mockRestore();
      await expect(tripIds(photoRepository)).resolves.toEqual([]);
    });

    it('refuses to go past the per-trip cap even when the callers counted earlier', async () => {
      const existing = Array.from({ length: MAX_PHOTOS_PER_TRIP - 1 }, (_, index) =>
        photo({ id: `e-${index}`, reference: `trip-photos/e-${index}.jpg` }),
      );
      const { photoRepository } = await seededPhotoDatabase(undefined, undefined, existing);

      // Two attaches that both saw room for one more photo: only the first may land.
      const first = await photoRepository.insertMany(TRIP_OWNER, [photo({ id: 'x', reference: 'trip-photos/x.jpg' })]);
      const second = await photoRepository.insertMany(TRIP_OWNER, [photo({ id: 'y', reference: 'trip-photos/y.jpg' })]);

      expect(first.ok).toBe(true);
      expect(!second.ok && second.error.kind).toBe('storage');
      expect(unwrap(await photoRepository.countByTrip(TRIP_OWNER, 'trip-1'))).toBe(MAX_PHOTOS_PER_TRIP);
    });

    it('accepts an empty list', async () => {
      const { photoRepository } = await seededPhotoDatabase();
      expect(await photoRepository.insertMany(TRIP_OWNER, [])).toEqual({ ok: true, value: undefined });
    });
  });

  describe('parents', () => {
    it("deletes a trip's photos with the trip", async () => {
      const { photoRepository, tripRepository, database } = await seededPhotoDatabase(undefined, undefined, [
        photo({ id: 'a', reference: 'trip-photos/a.jpg' }),
        photo({ id: 'b', reference: 'trip-photos/b.jpg', activityId: 'act-1' }),
      ]);

      expect((await tripRepository.delete(TRIP_OWNER, 'trip-1')).ok).toBe(true);

      await expect(database.getFirst('SELECT COUNT(*) AS count FROM photos')).resolves.toEqual({ count: 0 });
      expect(unwrap(await photoRepository.allReferences())).toEqual([]);
    });

    it("deletes an activity's photos with the activity and keeps the trip's own", async () => {
      const { photoRepository, activityRepository } = await seededPhotoDatabase(undefined, undefined, [
        photo({ id: 'trip-level', reference: 'trip-photos/a.jpg' }),
        photo({ id: 'activity-level', reference: 'trip-photos/b.jpg', activityId: 'act-1' }),
      ]);

      expect((await activityRepository.delete(TRIP_OWNER, 'act-1')).ok).toBe(true);

      await expect(tripIds(photoRepository)).resolves.toEqual(['trip-level']);
    });

    it.each<[string, Partial<Photo>]>([
      ['a trip that does not exist', { tripId: 'gone' }],
      ['an activity that does not exist', { activityId: 'gone' }],
    ])('refuses a photo for %s', async (_name, overrides) => {
      const { photoRepository } = await seededPhotoDatabase();
      const result = await photoRepository.insertMany(TRIP_OWNER, [photo(overrides)]);
      expect(!result.ok && result.error.kind).toBe('storage');
    });
  });

  describe('schema', () => {
    it.each<[string, Partial<Photo>]>([
      ['a zero width', { width: 0 }],
      ['a negative height', { height: -1 }],
      ['a zero file size', { fileSize: 0 }],
      ['a non-JPEG type', { mimeType: 'image/png' as Photo['mimeType'] }],
      ['an unknown source', { source: 'drone' as Photo['source'] }],
      ['an empty reference', { reference: '' }],
    ])('rejects %s even if validation were bypassed', async (_name, overrides) => {
      const { photoRepository } = await seededPhotoDatabase();
      const result = await photoRepository.insertMany(TRIP_OWNER, [photo(overrides)]);
      expect(!result.ok && result.error.kind).toBe('storage');
    });

    it('rejects a duplicate id or a reference already in use', async () => {
      const { photoRepository } = await seededPhotoDatabase(undefined, undefined, [photo()]);
      const sameId = await photoRepository.insertMany(TRIP_OWNER, [photo({ reference: 'trip-photos/other.jpg' })]);
      const sameFile = await photoRepository.insertMany(TRIP_OWNER, [photo({ id: 'photo-2' })]);
      expect(sameId.ok).toBe(false);
      expect(sameFile.ok).toBe(false);
    });

    it('rejects a photo without an owner', async () => {
      const { photoRepository } = await seededPhotoDatabase();
      const result = await photoRepository.insertMany('', [photo()]);
      expect(!result.ok && result.error.kind).toBe('storage');
    });

    it('is migration 5, after the budget', () => {
      expect(APP_MIGRATIONS.map(({ version }) => version).slice(0, 5)).toEqual([1, 2, 3, 4, 5]);
      expect(APP_MIGRATIONS[4]?.name).toMatch(/photos/);
    });

    it('cascades from trips and activities and indexes the gallery query', async () => {
      const { database } = createPhotoStorage();
      const keys = await database.getAll<{ table: string; on_delete: string }>(
        'SELECT "table", on_delete FROM pragma_foreign_key_list(\'photos\') ORDER BY "table"',
      );
      expect(keys).toEqual([
        { table: 'activities', on_delete: 'CASCADE' },
        { table: 'trips', on_delete: 'CASCADE' },
      ]);
      const indexes = await database.getAll<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'photos' AND sql IS NOT NULL",
      );
      expect(indexes.length).toBeGreaterThanOrEqual(2);
    });

    it('upgrades a version 4 database and keeps its trips, activities and expenses', async () => {
      const engine = createNodeSqliteEngine();
      const logger = createTestLogger();
      const open = (migrations = APP_MIGRATIONS) =>
        new SqliteDatabase({ driver: nodeSqliteDriver(() => engine).driver, migrations, logger });

      const v4 = open(APP_MIGRATIONS.filter(({ version }) => version <= 4));
      await new LocalTripRepository(v4, logger).insert(TRIP_OWNER, PHOTOS_TRIP);
      await new LocalActivityRepository(v4, logger).insert(TRIP_OWNER, PHOTO_ACTIVITY);
      await new LocalExpenseRepository(v4, logger).insert(TRIP_OWNER, expense({ date: '2027-07-02' }));
      await expect(v4.getFirst('PRAGMA user_version')).resolves.toEqual({ user_version: 4 });
      await v4.close();

      const upgraded = open();
      const repository = new LocalPhotoRepository(upgraded, logger);
      expect((await repository.insertMany(TRIP_OWNER, [photo({ activityId: 'act-1' })])).ok).toBe(true);

      await expect(upgraded.getFirst('PRAGMA user_version')).resolves.toEqual({ user_version: APP_MIGRATIONS.length });
      expect(unwrap(await new LocalTripRepository(upgraded, logger).list(TRIP_OWNER))).toEqual([PHOTOS_TRIP]);
      expect(unwrap(await new LocalActivityRepository(upgraded, logger).listByTrip(TRIP_OWNER, 'trip-1'))).toHaveLength(
        1,
      );
      expect(unwrap(await new LocalExpenseRepository(upgraded, logger).listByTrip(TRIP_OWNER, 'trip-1'))).toHaveLength(
        1,
      );
      expect(unwrap(await repository.listByTrip(TRIP_OWNER, 'trip-1'))).toEqual([photo({ activityId: 'act-1' })]);
    });
  });

  describe('separation between accounts', () => {
    async function twoAccounts() {
      const storage = await seededPhotoDatabase(undefined, undefined, [photo({ id: 'mine' })]);
      await storage.tripRepository.insert(OTHER_TRIP_OWNER, storedTrip({ id: 'their-trip' }));
      await storage.activityRepository.insert(OTHER_TRIP_OWNER, activity({ id: 'their-act', tripId: 'their-trip' }));
      await storage.photoRepository.insertMany(OTHER_TRIP_OWNER, [
        photo({ id: 'theirs', tripId: 'their-trip', activityId: 'their-act', reference: 'trip-photos/theirs.jpg' }),
      ]);
      return storage;
    }

    it("lists, counts and finds only the owner's photos", async () => {
      const { photoRepository } = await twoAccounts();
      await expect(tripIds(photoRepository, 'their-trip')).resolves.toEqual([]);
      expect(unwrap(await photoRepository.listByActivity(TRIP_OWNER, 'their-act'))).toEqual([]);
      expect(unwrap(await photoRepository.countByTrip(TRIP_OWNER, 'their-trip'))).toBe(0);
      expect(unwrap(await photoRepository.findById(TRIP_OWNER, 'theirs'))).toBeNull();
      expect(unwrap(await photoRepository.findById(OTHER_TRIP_OWNER, 'theirs'))?.id).toBe('theirs');
    });

    it("treats another account's photo as missing and keeps it", async () => {
      const { photoRepository } = await twoAccounts();
      const deleted = await photoRepository.delete(TRIP_OWNER, 'theirs');
      expect(!deleted.ok && deleted.error.kind).toBe('notFound');
      await expect(tripIds(photoRepository, 'their-trip', OTHER_TRIP_OWNER)).resolves.toEqual(['theirs']);
    });

    it("refuses a photo for another account's trip", async () => {
      const { photoRepository } = await twoAccounts();
      const result = await photoRepository.insertMany(TRIP_OWNER, [
        photo({ id: 'sneaky', tripId: 'their-trip', reference: 'trip-photos/sneaky.jpg' }),
      ]);
      expect(result.ok).toBe(false);
      expect(unwrap(await photoRepository.findById(TRIP_OWNER, 'sneaky'))).toBeNull();
    });
  });

  it('keeps photos across an app restart', async () => {
    const engine = createNodeSqliteEngine();
    const logger = createTestLogger();
    const open = () =>
      new SqliteDatabase({ driver: nodeSqliteDriver(() => engine).driver, migrations: APP_MIGRATIONS, logger });

    const first = open();
    await new LocalTripRepository(first, logger).insert(TRIP_OWNER, PHOTOS_TRIP);
    await new LocalPhotoRepository(first, logger).insertMany(TRIP_OWNER, [photo()]);
    await first.close();

    expect(unwrap(await new LocalPhotoRepository(open(), logger).listByTrip(TRIP_OWNER, 'trip-1'))).toEqual([photo()]);
  });

  it('skips a row with corrupt metadata, logs it, and still returns the rest', async () => {
    const { photoRepository, database, logger } = await seededPhotoDatabase(undefined, undefined, [
      photo({ id: 'good', reference: 'trip-photos/good.jpg' }),
      photo({ id: 'bad', reference: 'trip-photos/bad.jpg' }),
    ]);
    await database.run('PRAGMA ignore_check_constraints = ON');
    await database.run("UPDATE photos SET source = 'drone', width = -5 WHERE id = 'bad'");
    await database.run('PRAGMA ignore_check_constraints = OFF');

    await expect(tripIds(photoRepository)).resolves.toEqual(['good']);
    expect(unwrap(await photoRepository.findById(TRIP_OWNER, 'bad'))).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/photo/i), expect.objectContaining({ skipped: 1 }));
  });

  it('returns a row whose file reference looks invalid, so the gallery can show it as unavailable', async () => {
    const { photoRepository, database } = await seededPhotoDatabase(undefined, undefined, [photo({ id: 'odd' })]);
    await database.run('PRAGMA ignore_check_constraints = ON');
    await database.run("UPDATE photos SET reference = '../../etc/passwd' WHERE id = 'odd'");
    await database.run('PRAGMA ignore_check_constraints = OFF');

    expect(unwrap(await photoRepository.findById(TRIP_OWNER, 'odd'))?.reference).toBe('../../etc/passwd');
  });

  it('turns database failures into storage errors instead of throwing', async () => {
    const { photoRepository, handle } = createPhotoStorage();
    handle.failOpens = 1;
    const result = await photoRepository.listByTrip(TRIP_OWNER, 'trip-1');
    expect(!result.ok && result.error.kind).toBe('storage');
    expect((await photoRepository.listByTrip(TRIP_OWNER, 'trip-1')).ok).toBe(true);
  });
});
