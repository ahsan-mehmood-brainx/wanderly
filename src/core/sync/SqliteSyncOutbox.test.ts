import { createOfflineStorage } from '@/testing/offlineFixtures';

import { type LocalChange } from './LocalChange';

const OWNER = '1';
const change = (kind: LocalChange['kind'], entityId = 'trip-1', entityType = 'trip'): LocalChange => ({
  ownerId: OWNER,
  entityType,
  entityId,
  kind,
});

async function setup() {
  const storage = createOfflineStorage();
  const record = (...changes: LocalChange[]) =>
    storage.database.transaction((tx) => storage.outbox.record(tx, changes));
  const due = () => storage.outbox.listDue(OWNER, storage.clock.now(), 50);
  return { ...storage, record, due };
}

describe('SqliteSyncOutbox', () => {
  it('records one operation per entity and coalesces repeated edits', async () => {
    const { record, due } = await setup();

    await record(change('create'));
    await record(change('update'));
    await record(change('update'));

    const operations = await due();
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({ entityType: 'trip', entityId: 'trip-1', kind: 'upsert', isNew: true });
  });

  it('gives every version of a change its own idempotency key', async () => {
    const { record, due } = await setup();
    await record(change('create'));
    const [first] = await due();
    await record(change('update'));
    const [second] = await due();

    expect(first?.idempotencyKey).toMatch(/^trip:trip-1:/);
    expect(second?.idempotencyKey).not.toBe(first?.idempotencyKey);
  });

  it('removes a new entity deleted before it was pushed', async () => {
    const { record, due, outbox } = await setup();
    await record(change('create'));
    await record(change('delete'));

    expect(await due()).toEqual([]);
    expect((await outbox.summary(OWNER)).pending).toBe(0);
  });

  it('rolls back with the transaction that recorded it', async () => {
    const { database, outbox, due } = await setup();

    await expect(
      database.transaction(async (tx) => {
        await outbox.record(tx, change('create'));
        throw new Error('write failed');
      }),
    ).rejects.toThrow('write failed');

    expect(await due()).toEqual([]);
  });

  it('notifies listeners when changes are recorded', async () => {
    const { record, outbox } = await setup();
    const listener = jest.fn();
    outbox.recorded.subscribe(listener);

    await record(change('create'));

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('lets only one caller claim an operation', async () => {
    const { record, due, outbox, clock } = await setup();
    await record(change('create'));
    const [operation] = await due();

    expect(await outbox.claim(operation!, clock.now())).toBe(true);
    expect(await outbox.claim(operation!, clock.now())).toBe(false);
    expect(await due()).toEqual([]);
  });

  it('acknowledging removes the operation', async () => {
    const { record, due, outbox, clock } = await setup();
    await record(change('create'));
    const [operation] = await due();
    await outbox.claim(operation!, clock.now());

    await outbox.acknowledge(operation!);

    expect(await outbox.summary(OWNER)).toMatchObject({ pending: 0, inFlight: 0, failed: 0 });
  });

  it('keeps a change made during the push, and no longer marks it new', async () => {
    const { record, due, outbox, clock } = await setup();
    await record(change('create'));
    const [pushed] = await due();
    await outbox.claim(pushed!, clock.now());

    await record(change('update'));
    await outbox.acknowledge(pushed!);

    const [remaining] = await due();
    expect(remaining).toMatchObject({ kind: 'upsert', isNew: false, status: 'pending' });
    expect(remaining?.idempotencyKey).not.toBe(pushed?.idempotencyKey);
  });

  it('keeps a delete made while a new entity was being pushed', async () => {
    const { record, due, outbox, clock } = await setup();
    await record(change('create'));
    const [pushed] = await due();
    await outbox.claim(pushed!, clock.now());

    await record(change('delete'));
    await outbox.acknowledge(pushed!);

    expect(await due()).toEqual([expect.objectContaining({ kind: 'delete' })]);
  });

  it('reschedules, counting the attempt unless the push never happened', async () => {
    const { record, due, outbox, clock } = await setup();
    await record(change('create'));
    const [operation] = await due();
    await outbox.claim(operation!, clock.now());

    await outbox.reschedule(operation!, clock.now() + 5_000, 'server', true, clock.now());
    expect(await due()).toEqual([]);
    clock.advance(5_000);
    const [retry] = await due();
    expect(retry).toMatchObject({ attempts: 1, lastErrorKind: 'server', idempotencyKey: operation!.idempotencyKey });

    await outbox.claim(retry!, clock.now());
    await outbox.reschedule(retry!, clock.now(), 'offline', false, clock.now());
    expect((await due())[0]?.attempts).toBe(1);
  });

  it('keeps failed operations until they are retried', async () => {
    const { record, due, outbox, clock } = await setup();
    await record(change('create'));
    const [operation] = await due();
    await outbox.markFailed(operation!, 'badRequest', clock.now());

    expect(await due()).toEqual([]);
    expect(await outbox.summary(OWNER)).toMatchObject({ failed: 1, byEntityType: { trip: 1 } });

    expect(await outbox.retryFailed(OWNER, clock.now())).toBe(1);
    expect(await due()).toEqual([expect.objectContaining({ status: 'pending', attempts: 0, lastErrorKind: null })]);
  });

  it('re-queues operations whose push was interrupted by a restart', async () => {
    const { record, due, outbox, clock } = await setup();
    await record(change('create'));
    const [operation] = await due();
    await outbox.claim(operation!, clock.now());

    expect(await outbox.recoverInterrupted(clock.now())).toBe(1);
    expect(await due()).toEqual([expect.objectContaining({ idempotencyKey: operation!.idempotencyKey })]);
  });

  it('keeps owners apart', async () => {
    const { database, outbox, clock } = await setup();
    await database.transaction((tx) => outbox.record(tx, { ...change('create'), ownerId: '2' }));

    expect(await outbox.listDue(OWNER, clock.now(), 10)).toEqual([]);
    expect((await outbox.summary('2')).pending).toBe(1);
  });

  it('reports the earliest due time', async () => {
    const { record, due, outbox, clock } = await setup();
    expect(await outbox.nextDueAt(OWNER)).toBeNull();
    await record(change('create'));
    const [operation] = await due();
    await outbox.reschedule(operation!, clock.now() + 60_000, 'server', true, clock.now());
    expect(await outbox.nextDueAt(OWNER)).toBe(clock.now() + 60_000);
  });
});
