import { APP_MIGRATIONS } from '@/bootstrap/databaseMigrations';
import { SqliteDatabase } from '@/core/database/SqliteDatabase';
import { type SqlParams } from '@/core/database/SqlDatabase';
import { LocalTripRepository } from '@/features/trips/data/LocalTripRepository';
import { activity, createItineraryStorage, ITINERARY_TRIP, seededItineraryDatabase } from '@/testing/itineraryFixtures';
import { createNodeSqliteEngine, nodeSqliteDriver } from '@/testing/nodeSqliteDriver';
import { createTestLogger } from '@/testing/testDependencies';
import { OTHER_TRIP_OWNER, storedTrip, TRIP_OWNER } from '@/testing/tripFixtures';

import { type Activity } from '../domain/Activity';
import { LocalActivityRepository } from './LocalActivityRepository';

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!result.ok) throw result.error;
  return result.value;
};

const DAY = '2027-07-01';

async function dayOrder(repository: LocalActivityRepository, date = DAY, tripId = 'trip-1') {
  return unwrap(await repository.listByTrip(TRIP_OWNER, tripId))
    .filter((item) => item.date === date)
    .map(({ id, sortOrder }) => [id, sortOrder]);
}

async function threeOnOneDay() {
  return seededItineraryDatabase(
    [ITINERARY_TRIP],
    [
      activity({ id: 'a', title: 'A', sortOrder: 0 }),
      activity({ id: 'b', title: 'B', sortOrder: 1 }),
      activity({ id: 'c', title: 'C', sortOrder: 2 }),
    ],
  );
}

describe('LocalActivityRepository', () => {
  it('stores and reads back every field', async () => {
    const { activityRepository } = await seededItineraryDatabase();
    const item = activity({
      title: 'Ünï "quoted" \'title\'; DROP TABLE activities',
      description: 'Line one\nLine two',
      category: 'entertainment',
      startTime: '19:30',
      endTime: '22:05',
      latitude: 38.6916,
      longitude: -9.2161,
      address: 'Av. Brasília',
      estimatedCost: 2550,
      currency: 'EUR',
      notes: 'Bring tickets',
      isCompleted: true,
      createdAt: 1,
      updatedAt: 2,
    });

    expect(await activityRepository.insert(TRIP_OWNER, item)).toEqual({ ok: true, value: undefined });
    expect(unwrap(await activityRepository.findById(TRIP_OWNER, item.id))).toEqual(item);
  });

  it('keeps an untimed activity without a place or cost', async () => {
    const { activityRepository } = await seededItineraryDatabase();
    const item = activity({ startTime: null, endTime: null, estimatedCost: null, latitude: null, longitude: null });
    await activityRepository.insert(TRIP_OWNER, item);
    expect(unwrap(await activityRepository.findById(TRIP_OWNER, item.id))).toEqual(item);
  });

  it('returns null for an unknown id', async () => {
    const { activityRepository } = await seededItineraryDatabase();
    expect(unwrap(await activityRepository.findById(TRIP_OWNER, 'nope'))).toBeNull();
  });

  it("lists only that trip's activities, by date then position", async () => {
    const { activityRepository } = await seededItineraryDatabase(
      [ITINERARY_TRIP, storedTrip({ id: 'trip-2', startDate: '2027-08-01', endDate: '2027-08-02' })],
      [
        activity({ id: 'd2', date: '2027-07-02', sortOrder: 0 }),
        activity({ id: 'd1-first', date: DAY, sortOrder: 0 }),
        activity({ id: 'd1-second', title: 'Second', date: DAY, sortOrder: 1 }),
        activity({ id: 'other', tripId: 'trip-2', date: '2027-08-01', sortOrder: 0 }),
      ],
    );

    expect(unwrap(await activityRepository.listByTrip(TRIP_OWNER, 'trip-1')).map(({ id }) => id)).toEqual([
      'd1-first',
      'd1-second',
      'd2',
    ]);
  });

  it('inserts at the given position and moves the rest of the day down', async () => {
    const { activityRepository } = await seededItineraryDatabase(
      [ITINERARY_TRIP],
      [activity({ id: 'a', sortOrder: 0 }), activity({ id: 'c', title: 'C', sortOrder: 1 })],
    );

    await activityRepository.insert(TRIP_OWNER, activity({ id: 'b', title: 'B', sortOrder: 1 }));

    await expect(dayOrder(activityRepository)).resolves.toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ]);
  });

  it('updates the editable fields but not the id, trip or createdAt', async () => {
    const { activityRepository } = await seededItineraryDatabase([ITINERARY_TRIP], [activity({ createdAt: 1 })]);
    const changed = activity({
      title: 'Jerónimos',
      category: 'other',
      startTime: '14:00',
      endTime: '15:00',
      estimatedCost: 1200,
      notes: 'Cloister',
      updatedAt: 99,
      createdAt: 50,
    });

    expect((await activityRepository.update(TRIP_OWNER, changed)).ok).toBe(true);
    expect(unwrap(await activityRepository.findById(TRIP_OWNER, 'act-1'))).toEqual({ ...changed, createdAt: 1 });
  });

  it('moves an activity to another day, keeping both days numbered from 0', async () => {
    const { activityRepository } = await threeOnOneDay();
    await activityRepository.insert(TRIP_OWNER, activity({ id: 'x', title: 'X', date: '2027-07-02', sortOrder: 0 }));
    const b = unwrap(await activityRepository.findById(TRIP_OWNER, 'b')) as Activity;

    await activityRepository.update(TRIP_OWNER, { ...b, date: '2027-07-02', sortOrder: 0 });

    await expect(dayOrder(activityRepository)).resolves.toEqual([
      ['a', 0],
      ['c', 1],
    ]);
    await expect(dayOrder(activityRepository, '2027-07-02')).resolves.toEqual([
      ['b', 0],
      ['x', 1],
    ]);
  });

  it('deletes an activity and closes the gap in its day', async () => {
    const { activityRepository } = await threeOnOneDay();
    expect((await activityRepository.delete(TRIP_OWNER, 'a')).ok).toBe(true);
    await expect(dayOrder(activityRepository)).resolves.toEqual([
      ['b', 0],
      ['c', 1],
    ]);
  });

  it('marks an activity done and not done', async () => {
    const { activityRepository } = await seededItineraryDatabase([ITINERARY_TRIP], [activity()]);

    expect((await activityRepository.setCompleted(TRIP_OWNER, 'act-1', true, 500)).ok).toBe(true);
    expect(unwrap(await activityRepository.findById(TRIP_OWNER, 'act-1'))).toMatchObject({
      isCompleted: true,
      updatedAt: 500,
    });

    await activityRepository.setCompleted(TRIP_OWNER, 'act-1', false, 600);
    expect(unwrap(await activityRepository.findById(TRIP_OWNER, 'act-1'))?.isCompleted).toBe(false);
  });

  it.each(['update', 'delete', 'setCompleted'] as const)('%s of a missing activity is notFound', async (operation) => {
    const { activityRepository } = await seededItineraryDatabase();
    const result =
      operation === 'update'
        ? await activityRepository.update(TRIP_OWNER, activity())
        : operation === 'delete'
          ? await activityRepository.delete(TRIP_OWNER, 'act-1')
          : await activityRepository.setCompleted(TRIP_OWNER, 'act-1', true, 1);
    expect(!result.ok && result.error.kind).toBe('notFound');
  });

  describe('reorder', () => {
    it('saves the new order as positions 0..n-1', async () => {
      const { activityRepository } = await threeOnOneDay();

      expect((await activityRepository.reorder(TRIP_OWNER, 'trip-1', DAY, ['c', 'a', 'b'], 700)).ok).toBe(true);

      await expect(dayOrder(activityRepository)).resolves.toEqual([
        ['c', 0],
        ['a', 1],
        ['b', 2],
      ]);
      expect(unwrap(await activityRepository.findById(TRIP_OWNER, 'c'))?.updatedAt).toBe(700);
    });

    it.each([
      ['a missing activity', ['c', 'a']],
      ['an unknown id', ['c', 'a', 'b', 'zzz']],
      ['a repeated id', ['c', 'a', 'a']],
    ])('refuses an order with %s and changes nothing', async (_name, orderedIds) => {
      const { activityRepository } = await threeOnOneDay();

      const result = await activityRepository.reorder(TRIP_OWNER, 'trip-1', DAY, orderedIds, 700);

      expect(!result.ok && result.error.kind).toBe('notFound');
      await expect(dayOrder(activityRepository)).resolves.toEqual([
        ['a', 0],
        ['b', 1],
        ['c', 2],
      ]);
    });

    it('rolls the whole order back when a write fails part-way', async () => {
      const { activityRepository, handle } = await threeOnOneDay();
      const connection = handle.connections[0];
      if (!connection) throw new Error('database not opened');
      const run = connection.run.bind(connection);
      jest.spyOn(connection, 'run').mockImplementation(async (sql: string, params: SqlParams = []) => {
        if (/^\s*UPDATE\s+activities/i.test(sql) && params.includes('a')) throw new Error('disk full');
        return run(sql, params);
      });

      const result = await activityRepository.reorder(TRIP_OWNER, 'trip-1', DAY, ['c', 'b', 'a'], 700);

      expect(!result.ok && result.error.kind).toBe('storage');
      jest.mocked(connection.run).mockRestore();
      await expect(dayOrder(activityRepository)).resolves.toEqual([
        ['a', 0],
        ['b', 1],
        ['c', 2],
      ]);
    });
  });

  describe('parent trips', () => {
    it("deletes a trip's activities with the trip", async () => {
      const { activityRepository, tripRepository, database } = await threeOnOneDay();

      expect((await tripRepository.delete(TRIP_OWNER, 'trip-1')).ok).toBe(true);

      expect(unwrap(await activityRepository.listByTrip(TRIP_OWNER, 'trip-1'))).toEqual([]);
      await expect(database.getFirst('SELECT COUNT(*) AS count FROM activities')).resolves.toEqual({ count: 0 });
    });

    it('refuses an activity for a trip that does not exist', async () => {
      const { activityRepository } = await seededItineraryDatabase([]);
      const result = await activityRepository.insert(TRIP_OWNER, activity({ tripId: 'gone' }));
      expect(!result.ok && result.error.kind).toBe('storage');
    });
  });

  describe('schema', () => {
    it.each([
      ['an empty title', { title: '' }],
      ['an unknown category', { category: 'nightlife' as Activity['category'] }],
      ['an end time without a start time', { startTime: null, endTime: '10:00' }],
      ['an end time equal to the start time', { startTime: '10:00', endTime: '10:00' }],
      ['an end time before the start time', { startTime: '10:00', endTime: '09:00' }],
      ['only one coordinate', { latitude: 38.7, longitude: null }],
      ['a negative cost', { estimatedCost: -1 }],
      ['a bad currency', { currency: 'DOLLAR' }],
    ])('rejects %s even if validation were bypassed', async (_name, overrides) => {
      const { activityRepository } = await seededItineraryDatabase();
      const result = await activityRepository.insert(TRIP_OWNER, activity(overrides));
      expect(!result.ok && result.error.kind).toBe('storage');
    });

    it('rejects a duplicate id', async () => {
      const { activityRepository } = await seededItineraryDatabase([ITINERARY_TRIP], [activity()]);
      expect((await activityRepository.insert(TRIP_OWNER, activity({ sortOrder: 1 }))).ok).toBe(false);
    });

    it('rejects an activity without an owner', async () => {
      const { activityRepository } = await seededItineraryDatabase();
      const result = await activityRepository.insert('', activity());
      expect(!result.ok && result.error.kind).toBe('storage');
    });

    it('is migration 2, after the trips table', () => {
      expect(APP_MIGRATIONS.map(({ version }) => version).slice(0, 2)).toEqual([1, 2]);
    });

    it('creates the owner, trip, date and position index', async () => {
      const { database } = createItineraryStorage();
      await expect(
        database.getFirst(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_activities_owner_trip_date'",
        ),
      ).resolves.toEqual({ name: 'idx_activities_owner_trip_date' });
    });
  });

  describe('separation between accounts', () => {
    async function twoAccounts() {
      const storage = await seededItineraryDatabase([ITINERARY_TRIP], [activity({ id: 'mine', title: 'Mine' })]);
      await storage.tripRepository.insert(OTHER_TRIP_OWNER, storedTrip({ id: 'their-trip' }));
      await storage.activityRepository.insert(
        OTHER_TRIP_OWNER,
        activity({ id: 'theirs', tripId: 'their-trip', title: 'Theirs' }),
      );
      return storage;
    }

    it("lists and finds only the owner's activities", async () => {
      const { activityRepository } = await twoAccounts();
      expect(unwrap(await activityRepository.listByTrip(TRIP_OWNER, 'their-trip'))).toEqual([]);
      expect(unwrap(await activityRepository.findById(TRIP_OWNER, 'theirs'))).toBeNull();
      expect(unwrap(await activityRepository.findById(OTHER_TRIP_OWNER, 'theirs'))?.title).toBe('Theirs');
    });

    it("treats another account's activity as missing and leaves it unchanged", async () => {
      const { activityRepository } = await twoAccounts();
      const theirs = activity({ id: 'theirs', tripId: 'their-trip', title: 'Theirs' });

      const updated = await activityRepository.update(TRIP_OWNER, { ...theirs, title: 'Taken' });
      const completed = await activityRepository.setCompleted(TRIP_OWNER, 'theirs', true, 1);
      const deleted = await activityRepository.delete(TRIP_OWNER, 'theirs');
      const reordered = await activityRepository.reorder(TRIP_OWNER, 'their-trip', DAY, ['theirs'], 1);

      expect(!updated.ok && updated.error.kind).toBe('notFound');
      expect(!completed.ok && completed.error.kind).toBe('notFound');
      expect(!deleted.ok && deleted.error.kind).toBe('notFound');
      expect(!reordered.ok && reordered.error.kind).toBe('notFound');
      expect(unwrap(await activityRepository.findById(OTHER_TRIP_OWNER, 'theirs'))).toEqual(theirs);
    });
  });

  it('keeps activities across an app restart', async () => {
    const engine = createNodeSqliteEngine();
    const logger = createTestLogger();
    const open = () =>
      new SqliteDatabase({ driver: nodeSqliteDriver(() => engine).driver, migrations: APP_MIGRATIONS, logger });

    const first = open();
    await new LocalTripRepository(first, logger).insert(TRIP_OWNER, ITINERARY_TRIP);
    await new LocalActivityRepository(first, logger).insert(TRIP_OWNER, activity());
    await first.close();

    expect(unwrap(await new LocalActivityRepository(open(), logger).listByTrip(TRIP_OWNER, 'trip-1'))).toEqual([
      activity(),
    ]);
  });

  it('skips a corrupt row, logs it, and still returns the rest', async () => {
    const { activityRepository, database, logger } = await seededItineraryDatabase(
      [ITINERARY_TRIP],
      [activity({ id: 'good' }), activity({ id: 'bad', title: 'Bad', sortOrder: 1 })],
    );
    await database.run("UPDATE activities SET date = 'garbage' WHERE id = 'bad'");

    expect(unwrap(await activityRepository.listByTrip(TRIP_OWNER, 'trip-1')).map(({ id }) => id)).toEqual(['good']);
    expect(unwrap(await activityRepository.findById(TRIP_OWNER, 'bad'))).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith('Skipped unreadable activities', { skipped: 1 });
  });

  it('turns database failures into storage errors instead of throwing', async () => {
    const { activityRepository, handle } = createItineraryStorage();
    handle.failOpens = 1;
    const result = await activityRepository.listByTrip(TRIP_OWNER, 'trip-1');
    expect(!result.ok && result.error.kind).toBe('storage');
    expect((await activityRepository.listByTrip(TRIP_OWNER, 'trip-1')).ok).toBe(true);
  });
});
