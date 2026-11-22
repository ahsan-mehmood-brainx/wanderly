import { type SqliteDatabase } from '@/core/database/SqliteDatabase';
import { type AppDependencies } from '@/core/di/AppDependencies';
import { type PendingOperation } from '@/core/sync/PendingOperation';
import { BUDGET_TRIP, expense } from '@/testing/budgetFixtures';
import { customCollection, favorite } from '@/testing/favoritesFixtures';
import { activity } from '@/testing/itineraryFixtures';
import { type NodeSqliteConnection } from '@/testing/nodeSqliteDriver';
import { createTestDependencies } from '@/testing/testDependencies';
import { storedTrip, TRIP_OWNER } from '@/testing/tripFixtures';

import { EXPENSE_SYNC_ENTITY } from '@/features/budget/data/LocalExpenseRepository';
import { ACTIVITY_SYNC_ENTITY } from '@/features/itinerary/data/LocalActivityRepository';
import { TRIP_CASCADES } from '@/features/trips/data/LocalTripRepository';

import { createSyncEntitySources } from './syncEntitySources';

/** Repositories record every local change in the outbox, in the same transaction. */
describe('outbox recording (transactional outbox)', () => {
  let deps: AppDependencies;

  beforeEach(() => {
    deps = createTestDependencies();
  });

  const pending = async (): Promise<readonly PendingOperation[]> =>
    deps.syncOutbox.listDue(TRIP_OWNER, Number.MAX_SAFE_INTEGER, 100);
  const shapes = async () =>
    (await pending()).map(({ entityType, entityId, kind, isNew }) => ({ entityType, entityId, kind, isNew }));

  const unwrap = async <T>(promise: Promise<{ ok: boolean; value?: T; error?: unknown }>) => {
    const result = await promise;
    if (!result.ok) throw result.error;
    return result.value as T;
  };

  it('records trips created, edited and deleted', async () => {
    await unwrap(deps.tripRepository.insert(TRIP_OWNER, storedTrip()));
    expect(await shapes()).toEqual([{ entityType: 'trip', entityId: 'trip-1', kind: 'upsert', isNew: true }]);

    await unwrap(deps.tripRepository.update(TRIP_OWNER, storedTrip({ title: 'Porto' })));
    expect(await shapes()).toEqual([{ entityType: 'trip', entityId: 'trip-1', kind: 'upsert', isNew: true }]);

    await unwrap(deps.tripRepository.delete(TRIP_OWNER, 'trip-1'));
    expect(await shapes()).toEqual([]);
  });

  it("clears the pending changes of a deleted trip's activities and expenses (SQLite cascades them)", async () => {
    await unwrap(deps.tripRepository.insert(TRIP_OWNER, BUDGET_TRIP));
    await unwrap(deps.activityRepository.insert(TRIP_OWNER, activity({ date: '2027-06-11' })));
    await unwrap(deps.expenseRepository.insert(TRIP_OWNER, expense()));
    expect(await pending()).toHaveLength(3);

    await unwrap(deps.tripRepository.delete(TRIP_OWNER, 'trip-1'));

    expect(await pending()).toEqual([]);
    expect((await deps.syncOutbox.summary(TRIP_OWNER)).pending).toBe(0);
  });

  it('records deletes for the children of a trip that was already pushed', async () => {
    await unwrap(deps.tripRepository.insert(TRIP_OWNER, BUDGET_TRIP));
    await unwrap(deps.expenseRepository.insert(TRIP_OWNER, expense()));
    for (const operation of await pending()) await deps.syncOutbox.acknowledge(operation);

    await unwrap(deps.tripRepository.delete(TRIP_OWNER, 'trip-1'));

    expect(await shapes()).toEqual(
      expect.arrayContaining([
        { entityType: 'trip', entityId: 'trip-1', kind: 'delete', isNew: false },
        { entityType: 'expense', entityId: 'exp-1', kind: 'delete', isNew: false },
      ]),
    );
  });

  it('records nothing for a trip that does not exist', async () => {
    const result = await deps.tripRepository.delete(TRIP_OWNER, 'missing');
    expect(!result.ok && result.error.kind).toBe('notFound');
    expect(await pending()).toEqual([]);
  });

  it('cascades use the same entity types as the child repositories', () => {
    expect(TRIP_CASCADES.map(({ entityType }) => entityType)).toEqual([ACTIVITY_SYNC_ENTITY, EXPENSE_SYNC_ENTITY]);
  });

  it('does not save the trip when its pending operation cannot be written (atomic)', async () => {
    const database = deps.database as SqliteDatabase;
    await deps.tripRepository.list(TRIP_OWNER); // open the connection
    const connection = (database as unknown as { connection: Promise<NodeSqliteConnection> }).connection;
    (await connection).failNextMatching = 'INSERT INTO sync_outbox';

    const saved = await deps.tripRepository.insert(TRIP_OWNER, storedTrip());

    expect(!saved.ok && saved.error.kind).toBe('storage');
    expect(await unwrap(deps.tripRepository.list(TRIP_OWNER))).toEqual([]);
    expect(await pending()).toEqual([]);
  });

  it('records a reorder as an update of every activity on the day, and moved neighbours on insert', async () => {
    await unwrap(deps.tripRepository.insert(TRIP_OWNER, storedTrip()));
    await unwrap(deps.activityRepository.insert(TRIP_OWNER, activity({ id: 'a', sortOrder: 0 })));
    await unwrap(
      deps.activityRepository.insert(TRIP_OWNER, activity({ id: 'b', title: 'Lunch', startTime: null, sortOrder: 0 })),
    );
    const afterInsert = await shapes();
    expect(afterInsert).toEqual(
      expect.arrayContaining([
        { entityType: 'activity', entityId: 'a', kind: 'upsert', isNew: true },
        { entityType: 'activity', entityId: 'b', kind: 'upsert', isNew: true },
      ]),
    );

    await unwrap(deps.activityRepository.reorder(TRIP_OWNER, 'trip-1', '2027-07-01', ['a', 'b'], 1));
    await unwrap(deps.activityRepository.setCompleted(TRIP_OWNER, 'a', true, 2));
    await unwrap(deps.activityRepository.delete(TRIP_OWNER, 'b'));

    expect((await shapes()).filter((op) => op.entityType === 'activity')).toEqual([
      { entityType: 'activity', entityId: 'a', kind: 'upsert', isNew: true },
    ]);
  });

  it('records expenses, but not conversions (each device derives those)', async () => {
    await unwrap(deps.tripRepository.insert(TRIP_OWNER, BUDGET_TRIP));
    await unwrap(deps.expenseRepository.insert(TRIP_OWNER, expense()));
    const [created] = (await pending()).filter((op) => op.entityType === 'expense');

    await unwrap(
      deps.expenseRepository.updateConversions(TRIP_OWNER, [
        { id: 'exp-1', baseCurrency: 'USD', baseAmount: null, exchangeRate: null, updatedAt: 5 },
      ]),
    );

    const [after] = (await pending()).filter((op) => op.entityType === 'expense');
    expect(after?.idempotencyKey).toBe(created?.idempotencyKey);
  });

  it('records a favorite once however often it is saved, and membership changes as favorite updates', async () => {
    await unwrap(deps.favoritesRepository.ensureDefaultCollections(TRIP_OWNER, 1));
    await unwrap(deps.favoritesRepository.insertFavorite(TRIP_OWNER, favorite()));
    await unwrap(deps.favoritesRepository.insertFavorite(TRIP_OWNER, favorite({ id: 'fav-2' }))); // same target
    await unwrap(deps.favoritesRepository.insertCollection(TRIP_OWNER, customCollection()));
    await unwrap(deps.favoritesRepository.setMemberships(TRIP_OWNER, 'fav-1', ['col-1', 'want-to-visit'], 2));

    const operations = await shapes();
    expect(operations).toHaveLength(2);
    expect(operations).toEqual(
      expect.arrayContaining([
        { entityType: 'favorite', entityId: 'fav-1', kind: 'upsert', isNew: true },
        { entityType: 'collection', entityId: 'col-1', kind: 'upsert', isNew: true },
      ]),
    );

    const sources = createSyncEntitySources(deps);
    expect(await sources.favorite!(TRIP_OWNER, 'fav-1')).toEqual({
      ok: true,
      value: expect.objectContaining({
        id: 'fav-1',
        collectionIds: expect.arrayContaining(['col-1', 'want-to-visit']),
      }),
    });
  });

  it('reads the current state of each entity type for a push', async () => {
    await unwrap(deps.tripRepository.insert(TRIP_OWNER, storedTrip()));
    const sources = createSyncEntitySources(deps);

    expect(await sources.trip!(TRIP_OWNER, 'trip-1')).toEqual({ ok: true, value: storedTrip() });
    expect(await sources.activity!(TRIP_OWNER, 'missing')).toEqual({ ok: true, value: null });
    expect(await sources.collection!(TRIP_OWNER, 'missing')).toEqual({ ok: true, value: null });
  });
});
