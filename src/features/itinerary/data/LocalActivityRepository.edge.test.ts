import { type SqlDatabase } from '@/core/database/SqlDatabase';
import { activity, ITINERARY_TRIP, seededItineraryDatabase } from '@/testing/itineraryFixtures';
import { OTHER_TRIP_OWNER, TRIP_OWNER } from '@/testing/tripFixtures';

import { type LocalActivityRepository } from './LocalActivityRepository';

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!result.ok) throw result.error;
  return result.value;
};

const DAY = '2027-07-01';
const DAY_2 = '2027-07-02';

async function dayOrder(repository: LocalActivityRepository, date = DAY) {
  return unwrap(await repository.listByTrip(TRIP_OWNER, 'trip-1'))
    .filter((item) => item.date === date)
    .map(({ id, sortOrder }) => [id, sortOrder]);
}

/** Raw positions straight from SQLite, unreadable rows included. */
async function rawOrder(database: SqlDatabase, date = DAY) {
  const rows = await database.getAll<{ id: string; sort_order: number }>(
    'SELECT id, sort_order FROM activities WHERE date = ? ORDER BY sort_order, id',
    [date],
  );
  return rows.map(({ id, sort_order }) => [id, sort_order]);
}

const a = activity({ id: 'a', title: 'A', sortOrder: 0 });
const b = activity({ id: 'b', title: 'B', sortOrder: 1 });
const c = activity({ id: 'c', title: 'C', sortOrder: 2 });

describe('LocalActivityRepository edge cases', () => {
  describe('positions', () => {
    it('puts an insert past the end of the day last, numbered without a gap', async () => {
      const { activityRepository } = await seededItineraryDatabase([ITINERARY_TRIP], [a, b]);
      unwrap(await activityRepository.insert(TRIP_OWNER, activity({ id: 'late', title: 'Late', sortOrder: 40 })));
      await expect(dayOrder(activityRepository)).resolves.toEqual([
        ['a', 0],
        ['b', 1],
        ['late', 2],
      ]);
    });

    it('clamps an update past the end of the day to the last position', async () => {
      const { activityRepository } = await seededItineraryDatabase([ITINERARY_TRIP], [a, b, c]);
      unwrap(await activityRepository.update(TRIP_OWNER, { ...a, sortOrder: 99 }));
      await expect(dayOrder(activityRepository)).resolves.toEqual([
        ['b', 0],
        ['c', 1],
        ['a', 2],
      ]);
    });

    it('leaves the old day empty when its only activity moves to another day', async () => {
      const { activityRepository } = await seededItineraryDatabase(
        [ITINERARY_TRIP],
        [a, activity({ id: 'x', title: 'X', date: DAY_2, sortOrder: 0 })],
      );
      unwrap(await activityRepository.update(TRIP_OWNER, { ...a, date: DAY_2, sortOrder: 0 }));
      await expect(dayOrder(activityRepository)).resolves.toEqual([]);
      await expect(dayOrder(activityRepository, DAY_2)).resolves.toEqual([
        ['a', 0],
        ['x', 1],
      ]);
    });

    it('deletes the last activity of a day', async () => {
      const { activityRepository } = await seededItineraryDatabase([ITINERARY_TRIP], [a]);
      unwrap(await activityRepository.delete(TRIP_OWNER, 'a'));
      await expect(dayOrder(activityRepository)).resolves.toEqual([]);
      const again = await activityRepository.delete(TRIP_OWNER, 'a');
      expect(!again.ok && again.error.kind).toBe('notFound');
    });
  });

  describe('reorder refusals leave the day unchanged', () => {
    const unchanged = [
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ];

    it('refuses an order that repeats an id', async () => {
      const { activityRepository } = await seededItineraryDatabase([ITINERARY_TRIP], [a, b, c]);
      const result = await activityRepository.reorder(TRIP_OWNER, 'trip-1', DAY, ['a', 'a', 'b'], 5);
      expect(!result.ok && result.error.kind).toBe('notFound');
      await expect(dayOrder(activityRepository)).resolves.toEqual(unchanged);
    });

    it("refuses an order that includes another day's activity", async () => {
      const { activityRepository } = await seededItineraryDatabase(
        [ITINERARY_TRIP],
        [a, b, c, activity({ id: 'other-day', date: DAY_2, sortOrder: 0 })],
      );
      const result = await activityRepository.reorder(TRIP_OWNER, 'trip-1', DAY, ['c', 'b', 'other-day'], 5);
      expect(!result.ok && result.error.kind).toBe('notFound');
      await expect(dayOrder(activityRepository)).resolves.toEqual(unchanged);
    });

    it("refuses to reorder another account's day", async () => {
      const { activityRepository } = await seededItineraryDatabase([ITINERARY_TRIP], [a, b, c]);
      const result = await activityRepository.reorder(OTHER_TRIP_OWNER, 'trip-1', DAY, ['c', 'b', 'a'], 5);
      expect(!result.ok && result.error.kind).toBe('notFound');
      await expect(dayOrder(activityRepository)).resolves.toEqual(unchanged);
    });

    it('refuses an empty order for an empty day', async () => {
      const { activityRepository } = await seededItineraryDatabase([ITINERARY_TRIP], []);
      const result = await activityRepository.reorder(TRIP_OWNER, 'trip-1', DAY, [], 5);
      expect(!result.ok && result.error.kind).toBe('notFound');
    });
  });

  describe('a day holding an unreadable row', () => {
    async function withCorruptRow() {
      const storage = await seededItineraryDatabase([ITINERARY_TRIP], [a, b, c]);
      // Readable by SQLite's CHECKs, but not a valid time, so the row schema skips it.
      await storage.database.run("UPDATE activities SET start_time = 'soon', end_time = NULL WHERE id = 'b'");
      return storage;
    }

    it('can still be reordered: the readable activities take the order and the unreadable one goes last', async () => {
      const { activityRepository, database } = await withCorruptRow();
      await expect(dayOrder(activityRepository)).resolves.toEqual([
        ['a', 0],
        ['c', 2],
      ]);

      const result = await activityRepository.reorder(TRIP_OWNER, 'trip-1', DAY, ['c', 'a'], 5);

      expect(result).toEqual({ ok: true, value: undefined });
      await expect(dayOrder(activityRepository)).resolves.toEqual([
        ['c', 0],
        ['a', 1],
      ]);
      await expect(rawOrder(database)).resolves.toEqual([
        ['c', 0],
        ['a', 1],
        ['b', 2],
      ]);
    });

    it('still refuses an order that names the unreadable activity', async () => {
      const { activityRepository } = await withCorruptRow();
      const result = await activityRepository.reorder(TRIP_OWNER, 'trip-1', DAY, ['c', 'b', 'a'], 5);
      expect(!result.ok && result.error.kind).toBe('notFound');
    });

    it('closes the gap around it when a readable activity is deleted', async () => {
      const { activityRepository, database } = await withCorruptRow();
      unwrap(await activityRepository.delete(TRIP_OWNER, 'a'));
      await expect(rawOrder(database)).resolves.toEqual([
        ['b', 0],
        ['c', 1],
      ]);
    });
  });
});
