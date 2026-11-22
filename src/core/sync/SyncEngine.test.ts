import { AppError } from '@/core/errors/AppError';
import { err, ok } from '@/core/result';
import { FakeConnectivityService, OFFLINE, ONLINE } from '@/testing/FakeConnectivityService';
import { createNodeSqliteEngine } from '@/testing/nodeSqliteDriver';
import { createOfflineStorage, FakeSyncGateway } from '@/testing/offlineFixtures';

import { type LocalChange } from './LocalChange';
import { SyncEngine } from './SyncEngine';
import { LocalOnlySyncGateway, type SyncEntitySources, type SyncGateway } from './SyncGateway';
import { ExponentialSyncRetryPolicy } from './SyncRetryPolicy';

const OWNER = '1';

interface SetupOptions {
  readonly gateway?: SyncGateway;
  readonly engine?: ReturnType<typeof createNodeSqliteEngine>;
  readonly sources?: SyncEntitySources;
  readonly offline?: boolean;
}

function setup(options: SetupOptions = {}) {
  const storage = createOfflineStorage({ engine: options.engine });
  const gateway = options.gateway ?? new FakeSyncGateway();
  const connectivity = new FakeConnectivityService(options.offline ? OFFLINE : ONLINE);
  let ownerId: string | null = OWNER;
  const entities = new Map<string, unknown>();
  const sources: SyncEntitySources = options.sources ?? {
    trip: async (_owner, id) => ok(entities.get(id) ?? null),
  };
  const engine = new SyncEngine({
    outbox: storage.outbox,
    changeLog: storage.outbox,
    gateway,
    sources,
    connectivity,
    currentOwnerId: () => ownerId,
    clock: storage.clock,
    retryPolicy: new ExponentialSyncRetryPolicy({ random: () => 0.5, maxAttempts: 3 }),
    logger: storage.logger,
  });
  const record = async (kind: LocalChange['kind'], entityId = 'trip-1') => {
    if (kind !== 'delete') entities.set(entityId, { id: entityId, title: `Trip ${entityId}` });
    else entities.delete(entityId);
    await storage.database.transaction((tx) =>
      storage.outbox.record(tx, { ownerId: OWNER, entityType: 'trip', entityId, kind }),
    );
  };
  return {
    ...storage,
    engine,
    gateway: gateway as FakeSyncGateway,
    connectivity,
    entities,
    record,
    signOut: () => {
      ownerId = null;
    },
  };
}

describe('SyncEngine', () => {
  afterEach(() => jest.useRealTimers());

  it('only tracks changes when there is no backend (local-only)', async () => {
    const { engine, record } = setup({ gateway: new LocalOnlySyncGateway() });
    await record('create');
    await record('create', 'trip-2');

    await engine.sync();

    expect(engine.getSnapshot()).toMatchObject({ phase: 'localOnly', mode: 'localOnly', pending: 2, failed: 0 });
  });

  it('pushes the current state of each changed entity once, then empties the outbox', async () => {
    const { engine, gateway, record } = setup();
    await record('create');
    await record('update');

    await engine.sync();

    expect(gateway.pushes).toHaveLength(1);
    expect(gateway.pushes[0]).toMatchObject({
      operation: { entityId: 'trip-1', kind: 'upsert', isNew: true },
      entity: { id: 'trip-1', title: 'Trip trip-1' },
    });
    expect(engine.getSnapshot()).toMatchObject({ phase: 'idle', pending: 0 });
  });

  it('pushes a delete without an entity', async () => {
    const { engine, gateway, record, outbox, clock } = setup();
    await record('create');
    await engine.sync();
    await record('delete');
    clock.advance(1);

    await engine.sync();

    expect(gateway.pushes[1]).toMatchObject({ operation: { kind: 'delete' }, entity: null });
    expect((await outbox.summary(OWNER)).pending).toBe(0);
  });

  it('waits while offline and syncs when the connection returns', async () => {
    const { engine, gateway, record, connectivity } = setup({ offline: true });
    await record('create');
    const stop = engine.start();
    await engine.sync();
    expect(engine.getSnapshot()).toMatchObject({ phase: 'waitingForConnection', pending: 1 });
    expect(gateway.push).not.toHaveBeenCalled();

    connectivity.set(ONLINE);
    await engine.sync();

    expect(gateway.pushes).toHaveLength(1);
    expect(engine.getSnapshot().pending).toBe(0);
    stop();
  });

  it('pauses without counting an attempt when the connection drops mid-request, and resumes with the same key', async () => {
    const { engine, gateway, record, outbox, clock, connectivity } = setup();
    await record('create');
    gateway.respond(err(new AppError('offline', 'connection lost')));
    const stop = engine.start();
    await engine.sync();

    expect(engine.getSnapshot()).toMatchObject({ phase: 'waitingForConnection', pending: 1 });
    expect((await outbox.listDue(OWNER, clock.now(), 10))[0]?.attempts).toBe(0);

    connectivity.set(OFFLINE);
    connectivity.set(ONLINE);
    await engine.sync();

    expect(gateway.keys()).toHaveLength(2);
    expect(gateway.keys()[0]).toBe(gateway.keys()[1]);
    expect(engine.getSnapshot().pending).toBe(0);
    stop();
  });

  it('retries a failed push with backoff and the same idempotency key', async () => {
    const { engine, gateway, record, clock } = setup();
    await record('create');
    gateway.respond(err(new AppError('server', '503')));

    await engine.sync();
    expect(engine.getSnapshot()).toMatchObject({ pending: 1, lastErrorKind: 'server' });

    await engine.sync();
    expect(gateway.push).toHaveBeenCalledTimes(1); // not due yet

    clock.advance(5_000);
    await engine.sync();
    expect(gateway.keys()).toEqual([gateway.keys()[0], gateway.keys()[0]]);
    expect(engine.getSnapshot()).toMatchObject({ pending: 0, lastErrorKind: null });
  });

  it('schedules the next retry by itself while started', async () => {
    jest.useFakeTimers();
    const { engine, gateway, record, clock } = setup();
    await record('create');
    gateway.respond(err(new AppError('timeout', 'slow')));
    const stop = engine.start();
    await engine.sync();
    expect(gateway.push).toHaveBeenCalledTimes(1);

    clock.advance(5_000);
    await jest.advanceTimersByTimeAsync(5_000);
    await engine.sync();

    expect(gateway.push).toHaveBeenCalledTimes(2);
    stop();
  });

  it('marks non-retryable failures and exhausted retries as failed, and retries them on request', async () => {
    const { engine, gateway, record } = setup();
    await record('create');
    gateway.respond(err(new AppError('badRequest', 'rejected')));

    await engine.sync();
    expect(engine.getSnapshot()).toMatchObject({ pending: 0, failed: 1 });

    await engine.retryFailed();
    expect(gateway.push).toHaveBeenCalledTimes(2);
    expect(engine.getSnapshot()).toMatchObject({ pending: 0, failed: 0 });
  });

  it('runs once at a time: concurrent triggers never push the same operation twice', async () => {
    const { engine, gateway, record } = setup();
    await record('create');
    let release: () => void = () => undefined;
    gateway.respond(
      () =>
        new Promise((resolve) => {
          release = () => resolve(ok(undefined));
        }),
    );

    const first = engine.sync();
    const second = engine.sync();
    await new Promise((resolve) => setImmediate(resolve));
    release();
    await Promise.all([first, second]);

    expect(gateway.push).toHaveBeenCalledTimes(1);
  });

  it('after a restart, re-sends an interrupted push with the same idempotency key', async () => {
    const engineDb = createNodeSqliteEngine();
    const before = setup({ engine: engineDb });
    await before.record('create');
    const [operation] = await before.outbox.listDue(OWNER, before.clock.now(), 10);
    await before.outbox.claim(operation!, before.clock.now()); // the app is killed mid-push
    await before.database.close();

    const after = setup({ engine: engineDb });
    after.entities.set('trip-1', { id: 'trip-1' });
    await after.engine.sync();

    expect(after.gateway.keys()).toEqual([operation!.idempotencyKey]);
    expect(after.engine.getSnapshot().pending).toBe(0);
  });

  it('re-queues an operation left in flight by a run that threw, without waiting for a restart', async () => {
    const { engine, gateway, record, outbox } = setup();
    await record('create');
    const acknowledge = jest.spyOn(outbox, 'acknowledge').mockRejectedValueOnce(new Error('database busy'));

    await engine.sync();
    expect(engine.getSnapshot().phase).toBe('error');

    await engine.sync();
    expect(gateway.keys()).toEqual([gateway.keys()[0], gateway.keys()[0]]);
    expect(engine.getSnapshot()).toMatchObject({ phase: 'idle', pending: 0 });
    acknowledge.mockRestore();
  });

  it('treats a sync source that throws as a retryable failure', async () => {
    const { engine, gateway, record } = setup({
      sources: { trip: () => Promise.reject(new AppError('storage', 'disk')) },
    });
    await record('create');

    await engine.sync();

    expect(gateway.push).not.toHaveBeenCalled();
    expect(engine.getSnapshot()).toMatchObject({ pending: 1, failed: 0, lastErrorKind: 'storage' });
  });

  it('drops an upsert whose entity no longer exists', async () => {
    const { engine, gateway, record, entities } = setup();
    await record('update');
    entities.delete('trip-1');

    await engine.sync();

    expect(gateway.push).not.toHaveBeenCalled();
    expect(engine.getSnapshot().pending).toBe(0);
  });

  it('fails an operation with no source for its entity type instead of looping', async () => {
    const { engine, gateway, record } = setup({ sources: {} });
    await record('create');

    await engine.sync();

    expect(gateway.push).not.toHaveBeenCalled();
    expect(engine.getSnapshot().failed).toBe(1);
  });

  it('tries again after the offline pause even without a connectivity event', async () => {
    const { engine, gateway, record, clock } = setup();
    await record('create');
    gateway.respond(err(new AppError('offline', 'captive portal')));
    await engine.sync();
    await engine.sync();
    expect(gateway.push).toHaveBeenCalledTimes(1);

    clock.advance(30_000);
    await engine.sync();

    expect(gateway.push).toHaveBeenCalledTimes(2);
  });

  it('does nothing for a signed-out traveller', async () => {
    const { engine, gateway, record, signOut } = setup();
    await record('create');
    signOut();

    await engine.sync();

    expect(gateway.push).not.toHaveBeenCalled();
    expect(engine.getSnapshot().phase).toBe('signedOut');
  });

  it('reports a database it cannot read instead of throwing', async () => {
    const { engine, handle } = setup();
    handle.failOpens = 5;

    await engine.sync();

    expect(engine.getSnapshot()).toMatchObject({ phase: 'error', lastErrorKind: 'storage' });
  });

  it('syncs shortly after a local change while started', async () => {
    jest.useFakeTimers();
    const { engine, gateway, record } = setup();
    const stop = engine.start();
    await engine.sync();

    await record('create');
    await jest.advanceTimersByTimeAsync(1_000);
    await engine.sync();

    expect(gateway.push).toHaveBeenCalledTimes(1);
    stop();
  });
});
